#!/usr/bin/env node

/**
 * Cloud Secrets: Push secrets to cloud environment
 *
 * This command pushes secrets to a specific cloud environment:
 * 1. Generates FRESH framework secrets (never uses local ones)
 * 2. Auto-derives domain-dependent secrets from DOMAIN + infrastructure.json
 * 3. Pushes framework secrets in parallel
 * 4. Prompts only for truly user-specific secrets (DOMAIN, RESEND_API_KEY, EMAIL_FROM)
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:push --env staging
 *   npx tsdevstack cloud-secrets:push --env prod
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - Credentials file must exist for the environment
 * - .secrets.user.json must exist (for user secrets)
 *
 * The command will:
 * - Generate fresh framework secrets for the environment
 * - Auto-push TTLs, EMAIL_PROVIDER with sensible defaults
 * - Auto-derive API_URL, APP_URL, KONG_CORS_ORIGINS from DOMAIN
 * - Skip REDIS_* and DATABASE_URL (synced by infra:deploy from Terraform)
 * - Prompt only for DOMAIN, RESEND_API_KEY, EMAIL_FROM, and custom secrets
 *
 * See docs/in-dev/phase-8-cloud-secrets.md for detailed documentation
 */

import path from 'node:path';
import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import inquirer from 'inquirer';
import { cloudSecretsSet } from './cloud-secrets-set';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { secretExists } from '../utils/gcp/secret-exists';
import { loadAWSCredentials } from '../utils/aws/load-aws-credentials';
import { createAWSClient } from '../utils/aws/client-factory';
import { secretExists as secretExistsAWS } from '../utils/aws/secret-exists';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { createAzureClient } from '../utils/azure/create-azure-client';
import { secretExists as secretExistsAzure } from '../utils/azure/secret-exists';
import { transformKeyForAzure } from '../utils/azure/set-secret';
import { getSecret as getGCPSecret } from '../utils/gcp/get-secret';
import { getSecret as getAWSSecret } from '../utils/aws/get-secret';
import { getSecret as getAzureSecret } from '../utils/azure/get-secret';

/** Keys pushed as framework secrets with defaults (no prompt needed) */
const FRAMEWORK_DEFAULT_KEYS = [
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL',
  'CONFIRMATION_TOKEN_TTL',
  'EMAIL_PROVIDER',
] as const;

/** Keys auto-derived from DOMAIN + infrastructure.json (no prompt needed) */
const DOMAIN_DERIVED_KEYS = [
  'API_URL',
  'APP_URL',
  'KONG_CORS_ORIGINS',
] as const;

/** Keys that are local-only and should never be pushed to cloud */
const LOCAL_ONLY_KEYS = ['KONG_SERVICE_HOST'] as const;

/** Reserved keys in infrastructure.json environment config (not service names) */
const INFRA_RESERVED_KEYS = [
  'database',
  'redis',
  'kong',
  'loadBalancer',
  'security',
  'accessControl',
  'scheduledJobs',
  'appService',
  'frontdoorPremium',
] as const;

/**
 * Get helpful hints for environment-specific secrets
 */
function getEnvironmentHint(key: string): string | null {
  const hints: Record<string, string> = {
    DOMAIN: 'Your base domain (e.g., example.com)',
    RESEND_API_KEY: 'Your Resend API key (from resend.com/api-keys)',
    EMAIL_FROM: 'Sender email address (e.g., noreply@example.com)',
  };

  return hints[key] || null;
}

/**
 * Extract all domains from infrastructure.json for a given environment.
 * Returns domains from services that have a `domain` property configured.
 */
function extractDomainsFromInfraConfig(
  infraConfig: Record<string, unknown>,
  targetEnv: string,
): string[] {
  const envConfig = infraConfig[targetEnv] as
    | Record<string, unknown>
    | undefined;
  if (!envConfig) {
    return [];
  }

  const domains: string[] = [];
  for (const [key, value] of Object.entries(envConfig)) {
    if ((INFRA_RESERVED_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    const serviceConfig = value as Record<string, unknown> | undefined;
    if (serviceConfig?.domain && typeof serviceConfig.domain === 'string') {
      domains.push(serviceConfig.domain);
    }
  }

  return domains;
}

/**
 * Main cloud-secrets:push command
 */
export async function cloudSecretsPush(options: {
  env?: string;
  skipUserSecrets?: boolean;
}): Promise<void> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    generateFrameworkSecretsFile,
    loadUserSecrets,
    getAvailableEnvironments,
  } = getContext();

  logger.info('Cloud Secrets: Push secrets to cloud environment');
  logger.newline();

  // Step 1: Find project root
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    logger.error('Could not find project root (.tsdevstack/config.json)');
    process.exit(1);
  }

  // Step 2: Load framework config
  const config = loadFrameworkConfig();

  // Step 3: Get provider from config
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    logger.error('Cloud provider not configured in config.json');
    logger.newline();
    logger.info(
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
    process.exit(1);
  }

  // Step 3.5: If no env provided, prompt for it
  let selectedEnv: string;
  if (!options.env) {
    const availableEnvs = getAvailableEnvironments(projectRoot, provider);

    if (availableEnvs.length === 0) {
      logger.error('No environments found in credentials file!');
      logger.newline();
      logger.info(
        `Please add environments to .tsdevstack/.credentials.${provider}.json`,
      );
      process.exit(1);
    }

    const { env } = await inquirer.prompt([
      {
        type: 'list',
        name: 'env',
        message: 'Select environment to push secrets to:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = env;
    logger.newline();
  } else {
    selectedEnv = options.env;
  }

  // Step 4: Display environment prominently
  logger.warn(`Environment: ${selectedEnv.toUpperCase()}`);
  logger.newline();

  logger.loading(`Provider: ${provider.toUpperCase()}`);
  logger.loading(`Project: ${config.project.name}`);
  logger.loading(`Environment: ${selectedEnv}`);
  logger.newline();

  // Step 5: Generate FRESH framework secrets (never use local ones!)
  logger.generating('Generating fresh framework secrets...');
  const frameworkSecretsFile = generateFrameworkSecretsFile(config, null);
  const frameworkSecrets = frameworkSecretsFile.secrets;

  // Filter out metadata, non-string values, and secrets managed elsewhere
  const frameworkSecretsToUpload: Record<string, string> = {};
  for (const [key, value] of Object.entries(frameworkSecrets)) {
    if (key.startsWith('$') || typeof value !== 'string') {
      continue;
    }
    // Skip non-cloud secrets
    if (key === 'NODE_ENV' || key === 'SECRETS_PROVIDER') {
      continue;
    }
    // Skip all *_URL keys — service URLs are set after deployment,
    // DATABASE_URL is synced from Terraform outputs by infra:deploy
    if (key.endsWith('_URL')) {
      continue;
    }
    // Skip REDIS_* — synced from Terraform outputs by infra:deploy
    if (key.startsWith('REDIS_')) {
      continue;
    }
    frameworkSecretsToUpload[key] = value;
  }

  // Override KONG_SSL_VERIFY for cloud (secure by default - verify SSL certificates)
  frameworkSecretsToUpload.KONG_SSL_VERIFY = 'yes';

  // Add TTL defaults (sensible values, user can override with cloud-secrets:set)
  frameworkSecretsToUpload.ACCESS_TOKEN_TTL = '900';
  frameworkSecretsToUpload.REFRESH_TOKEN_TTL = '604800';
  frameworkSecretsToUpload.CONFIRMATION_TOKEN_TTL = '86400';

  // Default email provider to resend (only production provider in the framework)
  frameworkSecretsToUpload.EMAIL_PROVIDER = 'resend';

  logger.success(
    `Generated ${Object.keys(frameworkSecretsToUpload).length} framework secrets`,
  );
  logger.newline();

  // Step 6: Load user secrets from .secrets.user.json
  const userSecretsFile = loadUserSecrets();
  const userSecrets: Record<string, string> = {};

  if (userSecretsFile?.secrets) {
    for (const [key, value] of Object.entries(userSecretsFile.secrets)) {
      if (typeof value === 'string') {
        userSecrets[key] = value;
      }
    }
  }

  logger.loading(
    `Loaded ${Object.keys(userSecrets).length} user secrets from .secrets.user.json`,
  );
  logger.newline();

  // Step 7: Push framework secrets in parallel
  logger.updating('Pushing framework secrets...');
  logger.newline();

  const frameworkKeys = Object.keys(frameworkSecretsToUpload);
  const frameworkPromises = frameworkKeys.map((key, index) => {
    const value = frameworkSecretsToUpload[key];
    const progress = `[${index + 1}/${frameworkKeys.length}]`;

    logger.info(`${progress} ${key}`);

    return cloudSecretsSet(key, undefined, {
      value,
      env: selectedEnv,
      overwrite: false,
      internal: true,
    }).catch((error) => {
      return { error, key };
    });
  });

  const frameworkResults = await Promise.all(frameworkPromises);

  let frameworkPushed = 0;
  let frameworkFailed = 0;

  for (const result of frameworkResults) {
    if (result && 'error' in result) {
      frameworkFailed++;
    } else {
      frameworkPushed++;
    }
  }

  logger.newline();
  logger.summary('Framework secrets push complete:');
  logger.success(`   Pushed: ${frameworkPushed}`);
  if (frameworkFailed > 0) {
    logger.error(`   Failed: ${frameworkFailed}`);
    logger.newline();
    logger.error(
      'Framework secrets push failed. Check your cloud provider credentials and secret store access.',
    );
    process.exit(1);
  }
  logger.newline();

  // Step 7.5: Push user secrets (prompting only for truly user-specific ones)
  // Skip this step if --skip-user-secrets flag is set (for CI)
  if (options.skipUserSecrets) {
    logger.info('Skipping user secret prompts (--skip-user-secrets flag)');
    logger.newline();

    // Even with --skip-user-secrets, auto-derive domain-dependent secrets
    // if DOMAIN already exists in the cloud (set via cloud-secrets:set or previous push)
    const { buildSecretName, readJsonFile, TSDEVSTACK_DIR } = getContext();
    const domainSecretName = buildSecretName(
      config.project.name,
      'shared',
      'DOMAIN',
    );

    let domainValue: string | null = null;

    try {
      if (provider === 'gcp') {
        const credentials = loadGCPCredentials(projectRoot, selectedEnv);
        const client = createGCPClient(credentials);
        const fullSecretName = `projects/${credentials.project_id}/secrets/${domainSecretName}`;
        domainValue = await getGCPSecret(client, fullSecretName);
      } else if (provider === 'aws') {
        const credentials = loadAWSCredentials(projectRoot, selectedEnv);
        const client = createAWSClient(credentials);
        domainValue = await getAWSSecret(client, domainSecretName);
      } else if (provider === 'azure') {
        const credentials = loadAzureCredentials(projectRoot, selectedEnv);
        const client = createAzureClient(
          credentials,
          config.project.name,
          selectedEnv,
        );
        const azureSecretName = transformKeyForAzure(domainSecretName);
        domainValue = await getAzureSecret(client, azureSecretName);
      }
    } catch {
      logger.warn('Could not read DOMAIN from cloud (non-fatal)');
    }

    if (domainValue) {
      logger.generating(
        'Auto-deriving domain-dependent secrets from existing DOMAIN...',
      );
      logger.newline();

      const apiUrl = `https://api.${domainValue}`;

      let appUrl = `https://${domainValue}`;
      let infraConfig: Record<string, unknown> | null = null;

      try {
        const infraConfigPath = path.join(
          projectRoot,
          TSDEVSTACK_DIR,
          'infrastructure.json',
        );
        infraConfig = readJsonFile<Record<string, unknown>>(infraConfigPath);
      } catch {
        // infrastructure.json may not exist yet
      }

      if (infraConfig) {
        const domains = extractDomainsFromInfraConfig(infraConfig, selectedEnv);
        if (domains.length > 0) {
          appUrl = `https://${domains[0]}`;
        }
      }

      let corsOrigins = `https://${domainValue}`;
      if (infraConfig) {
        const domains = extractDomainsFromInfraConfig(infraConfig, selectedEnv);
        if (domains.length > 0) {
          corsOrigins = domains.map((d) => `https://${d}`).join(',');
        }
      }

      const derivedSecrets: Array<{ key: string; value: string }> = [
        { key: 'API_URL', value: apiUrl },
        { key: 'APP_URL', value: appUrl },
        { key: 'KONG_CORS_ORIGINS', value: corsOrigins },
      ];

      for (const { key, value } of derivedSecrets) {
        try {
          await cloudSecretsSet(key, undefined, {
            value,
            env: selectedEnv,
            overwrite: false,
            internal: true,
          });
          logger.success(`   ${key} = ${value}`);
        } catch {
          // overwrite: false will warn and skip if exists
        }
      }

      logger.newline();
    } else {
      logger.warn(
        'DOMAIN not set in cloud — skipping domain-dependent secrets',
      );
      logger.info(
        `Set DOMAIN first: npx tsdevstack cloud-secrets:set DOMAIN <domain> --env ${selectedEnv}`,
      );
      logger.newline();
    }

    logger.info(
      'Other user secrets must be set manually before first deployment:',
    );
    logger.info(`  npx tsdevstack cloud-secrets:push --env ${selectedEnv}`);
    logger.info('  Or set directly in cloud provider console');
    logger.newline();
  } else if (Object.keys(userSecrets).length > 0) {
    logger.updating('User secrets (checking existing, prompting for new)...');
    logger.newline();

    // Initialize client for checking secret existence
    const { buildSecretName, readJsonFile, TSDEVSTACK_DIR } = getContext();
    let gcpCredentials: ReturnType<typeof loadGCPCredentials> | undefined;
    let gcpClient: ReturnType<typeof createGCPClient> | undefined;
    let awsCredentials: ReturnType<typeof loadAWSCredentials> | undefined;
    let awsClient: ReturnType<typeof createAWSClient> | undefined;
    let azureCredentials: ReturnType<typeof loadAzureCredentials> | undefined;
    let azureClient: ReturnType<typeof createAzureClient> | undefined;

    if (provider === 'gcp') {
      gcpCredentials = loadGCPCredentials(projectRoot, selectedEnv);
      gcpClient = createGCPClient(gcpCredentials);
    } else if (provider === 'aws') {
      awsCredentials = loadAWSCredentials(projectRoot, selectedEnv);
      awsClient = createAWSClient(awsCredentials);
    } else {
      azureCredentials = loadAzureCredentials(projectRoot, selectedEnv);
      azureClient = createAzureClient(
        azureCredentials,
        config.project.name,
        selectedEnv,
      );
    }

    // Build set of keys to skip (handled by framework push or auto-derived)
    const keysToSkip = new Set<string>([
      ...(LOCAL_ONLY_KEYS as readonly string[]),
      ...(FRAMEWORK_DEFAULT_KEYS as readonly string[]),
      ...(DOMAIN_DERIVED_KEYS as readonly string[]),
    ]);

    // Separate DOMAIN from other promptable keys — DOMAIN must be prompted first
    // so we can auto-derive API_URL, APP_URL, KONG_CORS_ORIGINS after it
    const userKeys = Object.keys(userSecrets);
    const promptableKeys = userKeys.filter(
      (key) => !keysToSkip.has(key) && key !== 'DOMAIN',
    );

    // Helper to check if a secret already exists in the cloud
    const checkSecretExists = async (key: string): Promise<boolean> => {
      const secretName = buildSecretName(config.project.name, 'shared', key);
      if (provider === 'gcp' && gcpClient && gcpCredentials) {
        return secretExists(gcpClient, gcpCredentials.project_id, secretName);
      } else if (provider === 'aws' && awsClient) {
        return secretExistsAWS(awsClient, secretName);
      } else if (provider === 'azure' && azureClient) {
        const azureSecretName = transformKeyForAzure(secretName);
        return secretExistsAzure(azureClient, azureSecretName);
      }
      return false;
    };

    // Helper to prompt for and push a single secret
    const promptAndPushSecret = async (
      key: string,
      counters: {
        set: number;
        skipped: number;
        existing: number;
        failed: number;
      },
    ): Promise<void> => {
      const alreadyExists = await checkSecretExists(key);

      if (alreadyExists) {
        logger.info(`${key}`);
        logger.success(`   Already exists in ${selectedEnv}`);
        logger.newline();
        counters.existing++;
        return;
      }

      logger.info(`${key}`);

      const hint = getEnvironmentHint(key);
      if (hint) {
        logger.info(`   ${hint}`);
      }

      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `Enter value for ${selectedEnv} (leave empty to skip):`,
        },
      ]);

      if (!value || value.trim() === '') {
        logger.warn(
          `   Skipped ${key} (set later with: cloud-secrets:set ${key} --env ${selectedEnv})`,
        );
        counters.skipped++;
      } else {
        try {
          await cloudSecretsSet(key, undefined, {
            value: value.trim(),
            env: selectedEnv,
            overwrite: false,
            internal: true,
          });
          logger.success(`   Set ${key}`);
          counters.set++;
        } catch (error) {
          logger.error(
            `   Failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          counters.failed++;
        }
      }

      logger.newline();
    };

    const counters = { set: 0, skipped: 0, existing: 0, failed: 0 };

    // Step A: Prompt for DOMAIN first (if it's in user secrets)
    let domainValue: string | undefined;

    if (userSecrets.DOMAIN !== undefined) {
      const domainExists = await checkSecretExists('DOMAIN');

      if (!domainExists) {
        logger.info('DOMAIN');
        logger.info('   Your base domain (e.g., example.com)');

        const { value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: `Enter value for ${selectedEnv} (leave empty to skip):`,
          },
        ]);

        if (value && value.trim() !== '') {
          domainValue = value.trim();
          try {
            await cloudSecretsSet('DOMAIN', undefined, {
              value: domainValue,
              env: selectedEnv,
              overwrite: false,
              internal: true,
            });
            logger.success('   Set DOMAIN');
            counters.set++;
          } catch (error) {
            logger.error(
              `   Failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            counters.failed++;
            domainValue = undefined;
          }
        } else {
          logger.warn(
            `   Skipped DOMAIN (set later with: cloud-secrets:set DOMAIN --env ${selectedEnv})`,
          );
          counters.skipped++;
        }

        logger.newline();
      } else {
        logger.info('DOMAIN');
        logger.success(`   Already exists in ${selectedEnv}`);
        logger.newline();
        counters.existing++;
        // Read actual DOMAIN value to derive dependent secrets
        const domainSecretName = buildSecretName(
          config.project.name,
          'shared',
          'DOMAIN',
        );
        if (provider === 'gcp' && gcpClient && gcpCredentials) {
          const fullSecretName = `projects/${gcpCredentials.project_id}/secrets/${domainSecretName}`;
          domainValue =
            (await getGCPSecret(gcpClient, fullSecretName)) ?? undefined;
        } else if (provider === 'aws' && awsClient) {
          domainValue =
            (await getAWSSecret(awsClient, domainSecretName)) ?? undefined;
        } else if (provider === 'azure' && azureClient) {
          const azureSecretName = transformKeyForAzure(domainSecretName);
          domainValue =
            (await getAzureSecret(azureClient, azureSecretName)) ?? undefined;
        }
      }
    }

    // Step B: Auto-derive and push domain-dependent secrets
    if (domainValue) {
      logger.generating('Auto-deriving domain-dependent secrets...');
      logger.newline();

      // API_URL = https://api.{DOMAIN}
      const apiUrl = `https://api.${domainValue}`;

      // APP_URL = https://{frontend.domain from infrastructure.json} or https://{DOMAIN}
      let appUrl = `https://${domainValue}`;
      let infraConfig: Record<string, unknown> | null = null;

      try {
        const infraConfigPath = path.join(
          projectRoot,
          TSDEVSTACK_DIR,
          'infrastructure.json',
        );
        infraConfig = readJsonFile<Record<string, unknown>>(infraConfigPath);
      } catch {
        // infrastructure.json may not exist yet
      }

      if (infraConfig) {
        const domains = extractDomainsFromInfraConfig(infraConfig, selectedEnv);
        // Use first domain as APP_URL (typically the main frontend)
        if (domains.length > 0) {
          appUrl = `https://${domains[0]}`;
        }
      }

      // KONG_CORS_ORIGINS = all configured domains as https://
      let corsOrigins = `https://${domainValue}`;
      if (infraConfig) {
        const domains = extractDomainsFromInfraConfig(infraConfig, selectedEnv);
        if (domains.length > 0) {
          corsOrigins = domains.map((d) => `https://${d}`).join(',');
        }
      }

      const derivedSecrets: Array<{ key: string; value: string }> = [
        { key: 'API_URL', value: apiUrl },
        { key: 'APP_URL', value: appUrl },
        { key: 'KONG_CORS_ORIGINS', value: corsOrigins },
      ];

      for (const { key, value } of derivedSecrets) {
        const alreadyExists = await checkSecretExists(key);
        if (alreadyExists) {
          logger.info(`${key}`);
          logger.success(`   Already exists in ${selectedEnv}`);
        } else {
          try {
            await cloudSecretsSet(key, undefined, {
              value,
              env: selectedEnv,
              overwrite: false,
              internal: true,
            });
            logger.success(`   ${key} = ${value}`);
            counters.set++;
          } catch (error) {
            logger.error(
              `   Failed ${key}: ${error instanceof Error ? error.message : String(error)}`,
            );
            counters.failed++;
          }
        }
      }

      logger.newline();
    }

    // Step C: Prompt for remaining user-specific secrets
    for (const key of promptableKeys) {
      await promptAndPushSecret(key, counters);
    }

    // Log skipped keys for visibility
    const skippedAutoKeys = userKeys.filter((key) => keysToSkip.has(key));
    if (skippedAutoKeys.length > 0) {
      logger.info(
        `Auto-managed (no prompt needed): ${skippedAutoKeys.join(', ')}`,
      );
      logger.newline();
    }

    logger.summary('User secrets push complete:');
    if (counters.existing > 0)
      logger.success(`   Already exist: ${counters.existing}`);
    logger.success(`   Set: ${counters.set}`);
    if (counters.skipped > 0) logger.info(`   Skipped: ${counters.skipped}`);
    if (counters.failed > 0) logger.error(`   Failed: ${counters.failed}`);
    logger.newline();
  } else {
    logger.info('No user secrets to push');
    logger.newline();
  }

  // Step 8: Show summary
  logger.complete('Secrets push complete!');
  logger.newline();
  logger.warn('Next steps:');
  logger.info('1. Verify secrets in cloud provider console');
  logger.info(
    `2. Deploy infrastructure: npx tsdevstack infra:deploy --env ${selectedEnv}`,
  );
  logger.newline();
}
