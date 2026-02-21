#!/usr/bin/env node

/**
 * Cloud Secrets: Set or update a secret
 *
 * This command sets or updates a single user secret in a specific cloud environment.
 * CLOUD OPERATIONS ONLY - does not modify local files.
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:set <KEY> --env staging
 *   npx tsdevstack cloud-secrets:set <KEY> --value <VALUE> --env staging
 *   npx tsdevstack cloud-secrets:set DATABASE_URL --value "postgresql://..." --env prod --overwrite
 *   npx tsdevstack cloud-secrets:set DATABASE_URL --service auth-service --env dev
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - Credentials file must exist for the environment
 *
 * The command will:
 * - Warn if setting a framework-managed secret (but allow)
 * - Prompt for confirmation if overwriting existing secret
 * - Create secret if it doesn't exist
 * - Update secret if it exists and confirmed/--overwrite flag passed
 *
 * See docs/in-dev/phase-8-cloud-secrets.md for detailed documentation
 */

import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import inquirer from 'inquirer';
import type { CloudSecretResult } from '../utils/types';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { secretExists } from '../utils/gcp/secret-exists';
import { setSecret as setGCPSecret } from '../utils/gcp/set-secret';
import { loadAWSCredentials } from '../utils/aws/load-aws-credentials';
import { createAWSClient } from '../utils/aws/client-factory';
import { secretExists as secretExistsAWS } from '../utils/aws/secret-exists';
import { setSecret as setAWSSecret } from '../utils/aws/set-secret';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { createAzureClient } from '../utils/azure/create-azure-client';
import { secretExists as secretExistsAzure } from '../utils/azure/secret-exists';
import {
  setSecret as setAzureSecret,
  transformKeyForAzure,
} from '../utils/azure/set-secret';

/**
 * Main cloud-secrets:set command
 */
export async function cloudSecretsSet(
  key: string | undefined,
  positionalValue: string | undefined,
  options: {
    value?: string;
    env?: string;
    service?: string;
    overwrite?: boolean;
    internal?: boolean;
  },
): Promise<void> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    loadFrameworkSecrets,
    getAvailableEnvironments,
    buildSecretName,
  } = getContext();

  const internal = options.internal ?? false;
  logger.info('Cloud Secrets: Set or update a secret');
  logger.newline();

  // Step 1: Validate key parameter
  if (!key) {
    logger.error('Secret key is required');
    logger.newline();
    logger.info('Usage:');
    logger.info('   npx tsdevstack secrets:set <KEY>');
    logger.info('   npx tsdevstack secrets:set <KEY> --value <VALUE>');
    logger.newline();
    logger.info('Example:');
    logger.info('   npx tsdevstack secrets:set STRIPE_SECRET_KEY');
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
        message: 'Select environment:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = env;
    logger.newline();
  } else {
    selectedEnv = options.env;
  }

  // Step 5: Display environment prominently
  if (!internal) {
    logger.warn(`Environment: ${selectedEnv.toUpperCase()}`);
    logger.newline();
  }

  // Determine scope (service-specific or shared)
  const scope = options.service || 'shared';

  logger.loading(`Provider: ${provider.toUpperCase()}`);
  logger.loading(`Project: ${projectName}`);
  logger.loading(`Environment: ${selectedEnv}`);
  logger.loading(`Scope: ${scope}`);
  logger.loading(`Secret key: ${key}`);
  logger.newline();

  // Azure-specific warning about key name transformation
  if (provider === 'azure' && !internal) {
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
    logger.newline();
  }

  // Step 6: Check if framework secret
  if (!internal) {
    const frameworkSecrets = loadFrameworkSecrets();
    if (frameworkSecrets && key in frameworkSecrets.secrets) {
      logger.warn(`${key} is a framework-managed secret`);
      logger.info('Framework secrets should be pushed via cloud-secrets:push');
      logger.newline();
    }
  }

  // Step 7: Get secret value (positional > --value option > prompt)
  let value = positionalValue ?? options.value;
  if (!value && !internal) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: `Enter value for ${key}:`,
      },
    ]);
    value = answers.value;
  }

  if (!value) {
    logger.error('Secret value cannot be empty');
    process.exit(1);
  }

  // Step 8: Load credentials and create client
  const secretName = buildSecretName(projectName, scope, key);
  let gcpCredentials;
  let gcpClient;
  let awsCredentials;
  let awsClient;
  let azureCredentials;
  let azureClient;

  if (provider === 'gcp') {
    gcpCredentials = loadGCPCredentials(projectRoot, selectedEnv);
    gcpClient = createGCPClient(gcpCredentials);
  } else if (provider === 'aws') {
    awsCredentials = loadAWSCredentials(projectRoot, selectedEnv);
    awsClient = createAWSClient(awsCredentials);
  } else {
    azureCredentials = loadAzureCredentials(projectRoot, selectedEnv);
    azureClient = createAzureClient(azureCredentials, projectName, selectedEnv);
  }

  // Step 9: Check if secret exists in cloud
  let exists = false;
  if (provider === 'gcp' && gcpClient && gcpCredentials) {
    exists = await secretExists(
      gcpClient,
      gcpCredentials.project_id,
      secretName,
    );
  } else if (provider === 'aws' && awsClient) {
    exists = await secretExistsAWS(awsClient, secretName);
  } else if (provider === 'azure' && azureClient) {
    const azureSecretName = transformKeyForAzure(secretName);
    exists = await secretExistsAzure(azureClient, azureSecretName);
  }

  if (exists && !options.overwrite) {
    if (internal) {
      // Internal mode: warn and skip
      logger.warn(
        `Secret ${key} already exists in ${selectedEnv}. Skipped (no --overwrite flag)`,
      );
      return;
    } else {
      // Interactive mode: prompt
      const { confirmOverwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmOverwrite',
          message: `Secret ${key} already exists in ${selectedEnv}. Overwrite?`,
          default: false,
        },
      ]);

      if (!confirmOverwrite) {
        logger.info('Cancelled');
        return;
      }
    }
  }

  // Step 10: Set secret in cloud
  if (!internal) {
    logger.updating('Pushing to cloud provider...');
  }

  let result: CloudSecretResult;

  if (provider === 'gcp' && gcpClient && gcpCredentials) {
    result = await setGCPSecret(
      gcpClient,
      gcpCredentials.project_id,
      projectName,
      secretName,
      value,
    );
  } else if (provider === 'aws' && awsClient) {
    result = await setAWSSecret(awsClient, projectName, secretName, value);
  } else if (provider === 'azure' && azureClient) {
    const azureSecretName = transformKeyForAzure(secretName);
    const tags = {
      'project-name': projectName,
      'service-name': scope,
      'managed-by': 'tsdevstack',
    };
    result = await setAzureSecret(azureClient, azureSecretName, value, tags);
  } else {
    result = {
      success: false,
      isNew: false,
      error: 'Invalid provider or client not initialized',
    };
  }

  if (!result.success) {
    logger.error('Failed to push secret to cloud');
    logger.info(`Error: ${result.error}`);
    process.exit(1);
  }

  // Step 11: Show result
  if (!internal) {
    if (result.isNew) {
      logger.success(`Created new secret ${key} in ${selectedEnv}`);
    } else {
      logger.warn(`Overwritten ${key} in ${selectedEnv}`);
    }
    logger.newline();
    logger.complete('Secret set successfully!');
    logger.newline();
  }
}
