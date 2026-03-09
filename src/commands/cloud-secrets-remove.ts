#!/usr/bin/env node

/**
 * Cloud Secrets: Remove a secret
 *
 * This command removes a secret from the cloud provider:
 * 1. Confirms the deletion with user
 * 2. Deletes from cloud provider
 * 3. Optionally removes from local .secrets.user.json
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:remove <KEY>
 *   npx tsdevstack cloud-secrets:remove DATABASE_URL
 *   npx tsdevstack cloud-secrets:remove STRIPE_SECRET_KEY --force
 *   npx tsdevstack cloud-secrets:remove API_KEY --service auth-service --env dev
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - SECRETS_PROVIDER must be set in .env
 * - Credentials file must exist
 *
 * The command will:
 * - Ask for confirmation before deleting (unless --force)
 * - Show extra warning if removing a framework secret
 * - Delete secret from cloud provider
 * - Optionally remove from local .secrets.user.json
 * - Show confirmation of the operation
 *
 * WARNING: Removing framework secrets (from .secrets.tsdevstack.json) may break
 * your application. They will be regenerated when you run generate-secrets.
 *
 * See docs/in-dev/cloud-secrets-implementation.md for detailed documentation
 */

import { getContext } from '../context';
import type { CloudProvider, SecretsFile } from '@tsdevstack/cli/plugin';
import inquirer from 'inquirer';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { removeSecretByName as removeAWSSecretByName } from '../utils/aws/remove-secret-by-name';
import { removeSecretByName as removeAzureSecretByName } from '../utils/azure/remove-secret-by-name';

/**
 * Remove secret from GCP
 */
async function removeSecretFromGCP(
  client: SecretManagerServiceClient,
  projectId: string,
  secretName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.deleteSecret({
      name: `projects/${projectId}/secrets/${secretName}`,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main cloud-secrets:remove command
 */
export async function cloudSecretsRemove(
  key: string | undefined,
  options: { force?: boolean; env?: string; service?: string },
): Promise<void> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
    buildSecretName,
    isFile,
    readJsonFile,
    writeJsonFile,
  } = getContext();

  logger.info('Cloud Secrets: Remove a secret');
  logger.newline();

  // Step 1: Validate key parameter
  if (!key) {
    logger.error('Secret key is required');
    logger.newline();
    logger.info('Usage:');
    logger.info('   npx tsdevstack cloud-secrets:remove <KEY>');
    logger.info('   npx tsdevstack cloud-secrets:remove <KEY> --force');
    logger.info(
      '   npx tsdevstack cloud-secrets:remove <KEY> --service <service-name>',
    );
    logger.newline();
    logger.info('Example:');
    logger.info('   npx tsdevstack cloud-secrets:remove STRIPE_SECRET_KEY');
    logger.info(
      '   npx tsdevstack cloud-secrets:remove API_KEY --service auth-service --env dev',
    );
    process.exit(1);
  }

  // Step 2: Find project root
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    logger.error('Could not find project root (.tsdevstack/config.json)');
    process.exit(1);
  }

  // Step 3: Load framework config
  const config = loadFrameworkConfig();
  const projectName = config.project.name;

  // Step 4: Get provider from config (NOT from .env)
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    logger.error('Cloud provider not configured in config.json');
    logger.newline();
    logger.info(
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
    process.exit(1);
  }

  // Step 4.5: If no env provided, prompt for it
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
        message: 'Select environment to remove secret from:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = env;
    logger.newline();
  } else {
    selectedEnv = options.env;
  }

  const scope = options.service || 'shared';

  logger.loading(`Provider: ${provider.toUpperCase()}`);
  logger.loading(`Project: ${projectName}`);
  logger.loading(`Environment: ${selectedEnv}`);
  logger.loading(`Scope: ${scope}`);
  logger.loading(`Secret key: ${key}`);
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
    logger.newline();
  }

  // Step 5: Check if it's a framework secret (for warning purposes)
  const frameworkSecretsPath = `${projectRoot}/.secrets.tsdevstack.json`;
  let frameworkSecretKeys: string[] = [];
  if (isFile(frameworkSecretsPath)) {
    const frameworkSecrets = readJsonFile<SecretsFile>(frameworkSecretsPath);
    if (frameworkSecrets?.secrets) {
      frameworkSecretKeys = Object.keys(frameworkSecrets.secrets).filter(
        (k) => !k.startsWith('$'),
      );
    }
  }
  const isFrameworkSecret = frameworkSecretKeys.includes(key);

  // Step 7: Confirm deletion
  if (!options.force) {
    logger.warn('This will permanently delete the secret from cloud!');

    // Extra warning for framework secrets
    if (isFrameworkSecret) {
      logger.newline();
      logger.warn('FRAMEWORK SECRET DETECTED!');
      logger.info(`   ${key} is a framework-managed secret`);
      logger.info(
        '   Removing it may break your application until regenerated',
      );
    }

    logger.newline();

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete ${key}?`,
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Cancelled');
      process.exit(0);
    }

    logger.newline();
  }

  // Step 8: Remove secret from cloud
  logger.updating('Removing from cloud provider...');

  let result: { success: boolean; error?: string };
  const secretName = buildSecretName(projectName, scope, key);

  if (provider === 'gcp') {
    const credentials = loadGCPCredentials(projectRoot, selectedEnv);
    const client = createGCPClient(credentials);
    result = await removeSecretFromGCP(
      client,
      credentials.project_id,
      secretName,
    );
  } else if (provider === 'aws') {
    result = await removeAWSSecretByName(projectRoot, selectedEnv, secretName);
  } else {
    result = await removeAzureSecretByName(
      projectRoot,
      selectedEnv,
      projectName,
      secretName,
    );
  }

  if (!result.success) {
    // Check if error is "not found"
    if (
      result.error?.includes('NOT_FOUND') ||
      result.error?.includes('not found')
    ) {
      logger.warn('Secret not found in cloud (may have been already deleted)');
    } else {
      logger.error('Failed to remove secret from cloud');
      logger.info(`Error: ${result.error}`);
      process.exit(1);
    }
  } else {
    logger.success('Removed from cloud');
  }

  logger.newline();

  // Step 9: Ask about removing from local file (skip when --force)
  let removeLocal = false;
  if (!options.force) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'removeLocal',
        message: 'Remove from local .secrets.user.json as well?',
        default: true,
      },
    ]);
    removeLocal = answer.removeLocal;
  }

  if (removeLocal) {
    const userSecretsPath = `${projectRoot}/.secrets.user.json`;
    let removed = false;

    if (isFile(userSecretsPath)) {
      const userSecrets = readJsonFile<{ secrets?: Record<string, unknown> }>(
        userSecretsPath,
      );
      if (userSecrets?.secrets && userSecrets.secrets[key]) {
        delete userSecrets.secrets[key];
        writeJsonFile(userSecretsPath, userSecrets);
        removed = true;
      }
    }

    if (removed) {
      logger.success('Removed from .secrets.user.json');
      logger.newline();
      logger.warn('Remember to run:');
      logger.info('   npx tsdevstack generate-secrets');
      logger.info(
        'To regenerate .secrets.local.json without the removed secret',
      );
    } else {
      logger.info('Secret not found in .secrets.user.json (skipped)');
    }
  }

  logger.newline();
  logger.complete('Secret removed successfully!');
  logger.newline();
}
