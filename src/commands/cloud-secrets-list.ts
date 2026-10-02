#!/usr/bin/env node

/**
 * Cloud Secrets: List all secrets
 *
 * This command lists all secrets in the cloud provider:
 * 1. Lists all secrets for the project
 * 2. Groups by scope (shared vs service-specific)
 * 3. Shows keys only (not values for security)
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:list
 *   npx tsdevstack cloud-secrets:list --env dev
 *   npx tsdevstack cloud-secrets:list --json
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - SECRETS_PROVIDER must be set in .env
 * - Credentials file must exist
 *
 * The command will:
 * - List all secrets grouped by scope
 * - Show count of secrets per scope
 * - Optionally output as JSON
 *
 * See docs/in-dev/cloud-secrets-implementation.md for detailed documentation
 */

import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { listSecretsWithKeys as listGCPSecretsWithKeys } from '../utils/gcp/list-secrets-with-keys';
import { listSecretsWithKeys as listAWSSecretsWithKeys } from '../utils/aws/list-secrets-with-keys';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from '../utils/azure/list-secrets-with-keys';
import inquirer from 'inquirer';

/**
 * Main cloud-secrets:list command
 */
export async function cloudSecretsList(options: {
  env?: string;
  json?: boolean;
}): Promise<void> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
  } = getContext();

  // Step 1: Find project root
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    logger.error('Could not find project root (.tsdevstack/config.json)');
    process.exit(1);
  }

  // Step 2: Load framework config
  const config = loadFrameworkConfig();
  const projectName = config.project.name;

  // Step 3: Get provider from config (NOT from .env)
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    logger.error('Cloud provider not configured in config.json');
    logger.newline();
    logger.info(
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
    process.exit(1);
  }

  // Step 4: If no env provided, prompt for it
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
        type: 'select',
        name: 'env',
        message: 'Select environment to list secrets from:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = env;
    if (!options.json) {
      logger.newline();
    }
  } else {
    selectedEnv = options.env;
  }

  if (!options.json) {
    logger.info('Cloud Secrets: List all secrets');
    logger.newline();
    logger.loading(`Provider: ${provider.toUpperCase()}`);
    logger.loading(`Project: ${projectName}`);
    logger.loading(`Environment: ${selectedEnv}`);
    logger.newline();

    // Azure-specific warning about key name transformation
    if (provider === 'azure') {
      logger.warn('Azure Key Vault Naming:');
      logger.info(
        '   Azure only allows alphanumeric characters and hyphens in secret names.',
      );
      logger.info(
        '   Underscores are automatically converted: DATABASE_URL → DATABASE-URL',
      );
      logger.info(
        '   The conversion is reversed when reading secrets (transparent to your app).',
      );
      logger.info(
        '   If you manually set secrets in Azure Portal, use hyphens instead of underscores.',
      );
      logger.newline();
    }
  }

  // Step 5: List cloud secrets and group by scope
  const sharedSecrets: string[] = [];
  const serviceSecrets: Record<string, string[]> = {};
  let totalCount = 0;

  if (provider === 'gcp') {
    const credentials = loadGCPCredentials(projectRoot, selectedEnv);
    const client = createGCPClient(credentials);
    const extractedSecrets = await listGCPSecretsWithKeys(
      client,
      credentials.project_id,
      projectName,
    );

    for (const { key, scope } of extractedSecrets) {
      if (scope === 'shared') {
        sharedSecrets.push(key);
      } else {
        if (!serviceSecrets[scope]) {
          serviceSecrets[scope] = [];
        }
        serviceSecrets[scope].push(key);
      }
    }
    totalCount = extractedSecrets.length;
  } else if (provider === 'aws') {
    const extractedSecrets = await listAWSSecretsWithKeys(
      projectRoot,
      selectedEnv,
      projectName,
    );

    for (const { key, scope } of extractedSecrets) {
      if (scope === 'shared') {
        sharedSecrets.push(key);
      } else {
        if (!serviceSecrets[scope]) {
          serviceSecrets[scope] = [];
        }
        serviceSecrets[scope].push(key);
      }
    }
    totalCount = extractedSecrets.length;
  } else if (provider === 'azure') {
    const extractedSecrets = await listAzureSecretsWithKeys(
      projectRoot,
      selectedEnv,
      projectName,
    );

    for (const { key, scope } of extractedSecrets) {
      if (scope === 'shared') {
        sharedSecrets.push(key);
      } else {
        if (!serviceSecrets[scope]) {
          serviceSecrets[scope] = [];
        }
        serviceSecrets[scope].push(key);
      }
    }
    totalCount = extractedSecrets.length;
  }

  // Step 6: Output results
  if (options.json) {
    const output = {
      provider,
      project: projectName,
      environment: selectedEnv,
      total: totalCount,
      shared: sharedSecrets.sort(),
      services: serviceSecrets,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    logger.summary('Secrets in Cloud:');
    logger.newline();

    if (sharedSecrets.length > 0) {
      logger.info(`Shared secrets (${sharedSecrets.length}):`);
      sharedSecrets.sort().forEach((key) => {
        logger.info(`   ${key}`);
      });
      logger.newline();
    }

    const serviceNames = Object.keys(serviceSecrets);
    if (serviceNames.length > 0) {
      logger.info(
        `Service-specific secrets (${serviceNames.length} services):`,
      );
      serviceNames.sort().forEach((serviceName) => {
        const secrets = serviceSecrets[serviceName];
        logger.info(`   ${serviceName} (${secrets.length}):`);
        secrets.sort().forEach((key) => {
          logger.info(`      ${key}`);
        });
      });
      logger.newline();
    }

    if (totalCount === 0) {
      logger.warn('No secrets found in cloud');
      logger.newline();
      logger.info('To push secrets:');
      logger.info('   npx tsdevstack cloud-secrets:push');
    } else {
      logger.success(`Total: ${totalCount} secret(s)`);
    }

    logger.newline();
  }
}
