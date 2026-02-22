#!/usr/bin/env node

/**
 * Cloud Secrets: Get a secret value
 *
 * This command retrieves a secret value from the cloud provider.
 *
 * Usage:
 *   npx tsdevstack cloud-secrets:get <KEY> --env dev
 *   npx tsdevstack cloud-secrets:get DB_AUTH_PASSWORD --env staging
 *   npx tsdevstack cloud-secrets:get API_KEY --env prod --json
 *
 * Prerequisites:
 * - cloud:init must have been run
 * - Credentials file must exist for the environment
 * - Secret must exist in the cloud provider
 */

import { getContext } from '../context';
import type { CloudProvider } from 'tsdevstack/plugin';
import inquirer from 'inquirer';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { getSecret as getGCPSecret } from '../utils/gcp/get-secret';
import { loadAWSCredentials } from '../utils/aws/load-aws-credentials';
import { createAWSClient } from '../utils/aws/client-factory';
import { getSecret as getAWSSecret } from '../utils/aws/get-secret';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { createAzureClient } from '../utils/azure/create-azure-client';
import { getSecret as getAzureSecret } from '../utils/azure/get-secret';
import { transformKeyForAzure } from '../utils/azure/set-secret';

interface GetSecretOptions {
  env?: string;
  json?: boolean;
  service?: string;
}

/**
 * Main cloud-secrets:get command
 */
export async function cloudSecretsGet(
  key: string | undefined,
  options: GetSecretOptions,
): Promise<string | null> {
  const {
    logger,
    findProjectRoot,
    loadFrameworkConfig,
    getAvailableEnvironments,
    buildSecretName,
  } = getContext();

  // Step 1: Validate key parameter
  if (!key) {
    logger.error('Secret key is required');
    logger.newline();
    logger.info('Usage:');
    logger.info('   npx tsdevstack cloud-secrets:get <KEY> --env <env>');
    logger.newline();
    logger.info('Example:');
    logger.info(
      '   npx tsdevstack cloud-secrets:get DB_AUTH_PASSWORD --env dev',
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

  // Step 4: Get provider from config
  const provider = config.cloud?.provider as CloudProvider | 'local' | null;
  if (!provider || provider === 'local') {
    logger.error('Cloud provider not configured in config.json');
    logger.newline();
    logger.info(
      'Set cloud.provider to "gcp", "aws", or "azure" in .tsdevstack/config.json',
    );
    process.exit(1);
  }

  // Step 5: Resolve environment
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
        message: 'Select environment to get secret from:',
        choices: availableEnvs,
      },
    ]);
    selectedEnv = env;
  } else {
    selectedEnv = options.env;
  }

  // Step 6: Get secret from cloud provider
  let secretValue: string | null = null;
  const scope = options.service || 'shared';
  const secretName = buildSecretName(projectName, scope, key);

  if (provider === 'gcp') {
    const credentials = loadGCPCredentials(projectRoot, selectedEnv);
    const client = createGCPClient(credentials);
    const fullSecretName = `projects/${credentials.project_id}/secrets/${secretName}`;
    secretValue = await getGCPSecret(client, fullSecretName);
  } else if (provider === 'aws') {
    const credentials = loadAWSCredentials(projectRoot, selectedEnv);
    const client = createAWSClient(credentials);
    secretValue = await getAWSSecret(client, secretName);
  } else if (provider === 'azure') {
    const credentials = loadAzureCredentials(projectRoot, selectedEnv);
    const client = createAzureClient(credentials, projectName, selectedEnv);
    const azureSecretName = transformKeyForAzure(secretName);
    secretValue = await getAzureSecret(client, azureSecretName);
  }

  // Step 7: Output result
  if (secretValue === null) {
    if (options.json) {
      console.log(
        JSON.stringify({ key, value: null, error: 'Secret not found' }),
      );
    } else {
      logger.error(`Secret '${key}' not found in ${selectedEnv}`);
    }
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify({ key, value: secretValue }));
  } else {
    // Output just the value (useful for piping/scripting)
    console.log(secretValue);
  }

  return secretValue;
}
