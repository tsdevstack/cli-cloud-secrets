#!/usr/bin/env node

/**
 * Cloud Secrets: Compare local vs cloud secrets
 *
 * This command compares secrets between local and cloud:
 * 1. Lists all secrets in cloud provider
 * 2. Compares with local .secrets.local.json
 * 3. Shows missing, extra, and matching secrets
 * 4. Optionally shows value differences
 *
 * Usage: npx tsdevstack secrets:diff
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - SECRETS_PROVIDER must be set in .env
 * - Credentials file must exist
 *
 * The command will show:
 * - ✓ Secrets that match (exist in both)
 * - → Secrets only in local (need to push)
 * - ← Secrets only in cloud (need to pull/remove)
 *
 * See docs/in-dev/cloud-secrets-implementation.md for detailed documentation
 */

import { getContext } from '../context';
import type { CloudProvider, SecretsFile } from 'tsdevstack/plugin';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { listSecretsWithKeys as listGCPSecretsWithKeys } from '../utils/gcp/list-secrets-with-keys';
import { listSecretsWithKeys as listAWSSecretsWithKeys } from '../utils/aws/list-secrets-with-keys';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from '../utils/azure/list-secrets-with-keys';
import inquirer from 'inquirer';

/**
 * Main cloud-secrets:diff command
 */
export async function cloudSecretsDiff(env?: string): Promise<void> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
    isFile,
    readJsonFile,
  } = getContext();

  logger.info('Cloud Secrets: Compare local vs cloud secrets');
  logger.newline();

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

  // Step 3.5: If no env provided, prompt for it
  let selectedEnv: string;
  if (!env) {
    const availableEnvs = getAvailableEnvironments(projectRoot, provider);

    if (availableEnvs.length === 0) {
      logger.error('No environments found in credentials file!');
      logger.newline();
      logger.info(
        `Please add environments to .tsdevstack/.credentials.${provider}.json`,
      );
      process.exit(1);
    }

    const { env: promptedEnv } = await inquirer.prompt([
      {
        type: 'list',
        name: 'env',
        message: 'Select environment to compare:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = promptedEnv;
    logger.newline();
  } else {
    selectedEnv = env;
  }

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

  // Step 4: Load local secrets
  const secretsPath = `${projectRoot}/.secrets.local.json`;
  if (!isFile(secretsPath)) {
    logger.error('.secrets.local.json not found');
    logger.newline();
    logger.info('Please generate secrets first:');
    logger.info('   npx tsdevstack generate-secrets');
    process.exit(1);
  }

  const secretsFile = readJsonFile<SecretsFile>(secretsPath);
  const sharedSecrets = secretsFile?.secrets || {};

  // Filter out metadata fields and local-only secrets
  const localSecretKeys = Object.keys(sharedSecrets).filter((key) => {
    // Skip metadata fields
    if (key.startsWith('$')) return false;

    // Skip local-only secrets (never pushed to cloud)
    if (
      key === 'NODE_ENV' ||
      key === 'SECRETS_PROVIDER' ||
      key === 'KONG_SERVICE_HOST'
    ) {
      return false;
    }

    return true;
  });

  logger.loading(`Local secrets: ${localSecretKeys.length}`);

  // Step 5: List cloud secrets (only shared secrets for diff comparison)
  let cloudSecretKeys: string[] = [];

  if (provider === 'gcp') {
    const credentials = loadGCPCredentials(projectRoot, selectedEnv);
    const client = createGCPClient(credentials);
    const extractedSecrets = await listGCPSecretsWithKeys(
      client,
      credentials.project_id,
      projectName,
    );
    // For diff, only compare shared secrets
    cloudSecretKeys = extractedSecrets
      .filter((s) => s.scope === 'shared')
      .map((s) => s.key);
  } else if (provider === 'aws') {
    const extractedSecrets = await listAWSSecretsWithKeys(
      projectRoot,
      selectedEnv,
      projectName,
    );
    // For diff, only compare shared secrets
    cloudSecretKeys = extractedSecrets
      .filter((s) => s.scope === 'shared')
      .map((s) => s.key);
  } else if (provider === 'azure') {
    cloudSecretKeys = await listAzureSecretsWithKeys(
      projectRoot,
      selectedEnv,
      projectName,
    );
  }

  logger.loading(`Cloud secrets: ${cloudSecretKeys.length}`);
  logger.newline();

  // Step 6: Compare secrets
  const localSet = new Set(localSecretKeys);
  const cloudSet = new Set(cloudSecretKeys);

  const inBoth: string[] = [];
  const onlyLocal: string[] = [];
  const onlyCloud: string[] = [];

  // Check local secrets
  for (const key of localSecretKeys) {
    if (cloudSet.has(key)) {
      inBoth.push(key);
    } else {
      onlyLocal.push(key);
    }
  }

  // Check cloud secrets
  for (const key of cloudSecretKeys) {
    if (!localSet.has(key)) {
      onlyCloud.push(key);
    }
  }

  // Step 7: Display 3 separate lists

  // List 1: Keys in cloud
  logger.info(`Keys in cloud (${cloudSecretKeys.length}):`);
  cloudSecretKeys.sort().forEach((key) => {
    logger.info(`   ${key}`);
  });
  logger.newline();

  // List 2: Keys in local
  logger.info(`Keys in local (${localSecretKeys.length}):`);
  localSecretKeys.sort().forEach((key) => {
    logger.info(`   ${key}`);
  });
  logger.newline();

  // List 3: Differences (keys not in both)
  const totalDiff = onlyLocal.length + onlyCloud.length;
  if (totalDiff > 0) {
    logger.warn(`Differences (${totalDiff}):`);

    onlyLocal.sort().forEach((key) => {
      logger.info(`   ${key}: exists in local, missing in cloud`);
    });

    onlyCloud.sort().forEach((key) => {
      logger.info(`   ${key}: exists in cloud, missing in local`);
    });
    logger.newline();
  }

  // Summary
  logger.summary('Summary:');
  logger.info(`   Local: ${localSecretKeys.length}`);
  logger.info(`   Cloud: ${cloudSecretKeys.length}`);
  logger.info(`   Match: ${inBoth.length}`);
  logger.info(
    `   Diff:  ${Math.abs(localSecretKeys.length - cloudSecretKeys.length)}`,
  );
  logger.newline();
}
