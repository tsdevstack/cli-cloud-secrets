#!/usr/bin/env node

/**
 * Cloud Secrets: Initialize cloud provider integration
 *
 * This command initializes cloud secrets integration by:
 * 1. Choosing cloud provider (gcp/aws/azure)
 * 2. Saving provider to config.json
 * 3. Detecting all available environments from credentials file
 * 4. Testing ALL environments and reporting results
 * 5. Optionally pushing existing secrets to cloud
 *
 * Usage: npx tsdevstack cloud:init [--gcp|--aws|--azure]
 *
 * Prerequisites:
 * - Credentials file must exist: .tsdevstack/credentials.{provider}.json
 * - Project config must exist: .tsdevstack/config.json
 *
 * The command will:
 * - Test connection to all available environments
 * - Display results for each environment
 * - Ask if you want to push secrets immediately
 * - Does NOT modify .env (stays SECRETS_PROVIDER=local for local dev)
 *
 * See docs/in-dev/phase-8-cloud-secrets.md for detailed documentation
 */

import { execSync } from 'node:child_process';
import { getContext } from '../context';
import type { CloudProvider } from '@tsdevstack/cli/plugin';
import type { AzureCredentials } from '../utils/types';
import inquirer from 'inquirer';
import { cloudSecretsPush } from './cloud-secrets-push';
import type { EnvTestResult } from '../utils/types';
import { testAllGCPEnvironments } from '../utils/gcp/testing';
import { testAllAWSEnvironments } from '../utils/aws/testing';
import {
  testAllAzureEnvironments,
  registerResourceProviders,
} from '../utils/azure/testing';

/**
 * Main cloud:init command
 */
export async function cloudInit(providerOption?: string): Promise<void> {
  const {
    logger,
    findProjectRoot,
    getConfigPath,
    loadFrameworkConfig,
    readJsonFile,
    writeJsonFile,
    loadCredentialsFile,
    validateDuplicateCredentials,
    CLOUD_PROVIDERS,
    ensureKeyVaultExists,
  } = getContext();

  logger.info('Cloud Secrets: Initialize cloud provider integration');
  logger.newline();

  // Step 1: Find project root
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    logger.error('Could not find project root (.tsdevstack/config.json)');
    process.exit(1);
  }

  // Step 2: Load framework config
  const config = loadFrameworkConfig();
  logger.loading(`Project: ${config.project.name}`);
  logger.loading(`Services: ${config.services.length}`);
  logger.newline();

  // Step 3: Select provider (from option or prompt)
  let selectedProvider: CloudProvider;

  if (providerOption) {
    // Validate provider option
    if (!CLOUD_PROVIDERS.includes(providerOption as CloudProvider)) {
      logger.error(`Invalid provider: ${providerOption}`);
      logger.newline();
      logger.info(`Valid providers: ${CLOUD_PROVIDERS.join(', ')}`);
      process.exit(1);
    }
    selectedProvider = providerOption as CloudProvider;
    logger.info(`Using provider: ${selectedProvider.toUpperCase()}`);
  } else {
    // Interactive selection
    const { provider } = await inquirer.prompt([
      {
        type: 'select',
        name: 'provider',
        message: 'Select cloud provider:',
        choices: [
          {
            name: 'Google Cloud Platform (GCP Secret Manager)',
            value: 'gcp',
          },
          {
            name: 'Amazon Web Services (AWS Secrets Manager)',
            value: 'aws',
          },
          {
            name: 'Microsoft Azure (Azure Key Vault)',
            value: 'azure',
          },
        ],
      },
    ]);
    selectedProvider = provider;
  }

  logger.newline();

  // Step 4: Update config.json first (before testing)
  logger.updating('Updating config.json...');
  const configPath = getConfigPath(projectRoot);
  const configJson = readJsonFile<{ cloud?: { provider?: string } }>(
    configPath,
  );

  if (!configJson.cloud) {
    configJson.cloud = {};
  }
  configJson.cloud.provider = selectedProvider;

  writeJsonFile(configPath, configJson);
  logger.success(`Set cloud.provider="${selectedProvider}" in config.json`);
  logger.newline();

  // Step 4.5: Validate credentials for duplicate usage across environments
  logger.checking('Validating environment isolation...');
  try {
    const allCredentials = loadCredentialsFile(projectRoot, selectedProvider);
    validateDuplicateCredentials(allCredentials, selectedProvider);
    logger.success('All environments use unique credentials');
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(error.message);
      logger.newline();
      logger.info(
        'Please ensure each environment uses separate cloud resources.',
      );
      process.exit(1);
    }
  }
  logger.newline();

  // Step 4.6: GCP-specific validation - Ensure region is set for each environment
  if (selectedProvider === 'gcp') {
    const allCredentials = loadCredentialsFile(projectRoot, 'gcp') as Record<
      string,
      {
        project_id: string;
        client_email: string;
        private_key: string;
        region?: string;
      }
    >;

    const missingRegions: string[] = [];
    for (const [env, credentials] of Object.entries(allCredentials)) {
      if (!credentials.region) {
        missingRegions.push(env);
      }
    }

    if (missingRegions.length > 0) {
      logger.error('Missing region in credentials file!');
      logger.newline();
      logger.info(
        `Add "region" field to these environments: ${missingRegions.join(', ')}`,
      );
      logger.info('Example: "region": "us-central1"');
      logger.newline();
      logger.info(`Edit: .tsdevstack/.credentials.gcp.json`);
      process.exit(1);
    }

    // Bootstrap GCP project (enable APIs, add roles to SA)
    const firstEnv = Object.keys(allCredentials)[0];
    logger.info(
      'Bootstrapping GCP project (enabling APIs, adding permissions)...',
    );
    logger.newline();

    try {
      execSync(`npx tsdevstack infra:bootstrap --env ${firstEnv}`, {
        cwd: projectRoot,
        stdio: 'inherit',
      });
    } catch {
      logger.error('Bootstrap failed. Please check the error above.');
      process.exit(1);
    }

    logger.newline();
  }

  // Step 4.7: Azure-specific setup - Create Resource Groups and Key Vaults
  if (selectedProvider === 'azure') {
    logger.info('Setting up Azure resources...');
    logger.newline();

    try {
      const allCredentials = loadCredentialsFile(projectRoot, 'azure');
      const projectName = config.project.name;

      for (const [env, credentials] of Object.entries(allCredentials)) {
        const azureCredentials = credentials as AzureCredentials;
        logger.loading(`Setting up environment: ${env}`);

        // Register resource providers for each subscription
        logger.loading(`  Checking Azure resource providers for ${env}...`);
        const registerResult =
          await registerResourceProviders(azureCredentials);
        if (registerResult.success && registerResult.registering.length > 0) {
          logger.success(
            `  Registering ${registerResult.registering.length} resource providers for ${env} (Azure takes a few minutes): ${registerResult.registering.join(', ')}`,
          );
        } else if (registerResult.success) {
          logger.success(`  All resource providers registered for ${env}`);
        } else {
          logger.error(
            `  Failed to register providers for ${env}: ${registerResult.error}`,
          );
          throw new Error(
            `Failed to register providers for ${env}: ${registerResult.error}`,
          );
        }

        // Create resources
        logger.loading(`  Creating resources for ${env}...`);
        const result = await ensureKeyVaultExists(
          projectName,
          env,
          azureCredentials,
        );

        if (result.exists && result.created) {
          logger.success(`  Created Key Vault for ${env}`);
        } else if (result.exists && !result.created) {
          logger.success(`  Key Vault already exists for ${env}`);
        } else {
          logger.error(
            `  Failed to create Key Vault for ${env}: ${result.error}`,
          );
        }
      }

      logger.newline();
    } catch (error: unknown) {
      logger.error(
        `Failed to setup Azure resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      logger.newline();
      logger.info('Continuing with environment testing...');
      logger.newline();
    }
  }

  // Step 5: Test ALL environments from credentials file
  logger.checking(
    `Detecting and testing ${selectedProvider.toUpperCase()} environments...`,
  );
  logger.newline();

  let envResults: EnvTestResult[];

  if (selectedProvider === 'gcp') {
    envResults = await testAllGCPEnvironments(projectRoot);
  } else if (selectedProvider === 'aws') {
    envResults = await testAllAWSEnvironments(projectRoot);
  } else {
    envResults = await testAllAzureEnvironments(projectRoot);
  }

  if (envResults.length === 0) {
    logger.error('No environments found in credentials file!');
    logger.newline();
    logger.info(
      `Please add environments to .tsdevstack/.credentials.${selectedProvider}.json`,
    );
    process.exit(1);
  }

  // Display results for each environment
  const validEnvs = envResults.filter((r) => r.valid);
  const invalidEnvs = envResults.filter((r) => !r.valid);

  logger.info(
    `${envResults.length} environment${envResults.length > 1 ? 's' : ''} detected: ${envResults.map((r) => r.env).join(', ')}`,
  );
  logger.newline();

  if (validEnvs.length > 0) {
    logger.success('Connection successful to:');
    validEnvs.forEach((result) => {
      logger.success(
        `  ${result.env}${result.projectId ? ` (${result.projectId})` : ''}`,
      );
    });
    logger.newline();
  }

  if (invalidEnvs.length > 0) {
    logger.error('Connection failed for:');
    invalidEnvs.forEach((result) => {
      logger.error(`  ${result.env}: ${result.error}`);
    });
    logger.newline();
  }

  if (validEnvs.length === 0) {
    logger.error('All environment credentials failed!');
    logger.newline();
    logger.info('Please check your credentials file and try again.');
    process.exit(1);
  }

  // Step 6: Ask about pushing secrets
  const { pushSecrets } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'pushSecrets',
      message:
        'Do you want to generate cloud secrets? (you can select environment in the next step)',
      default: true,
    },
  ]);

  logger.newline();

  if (pushSecrets) {
    // Ask which environment to push to
    const { selectedEnv } = await inquirer.prompt([
      {
        type: 'select',
        name: 'selectedEnv',
        message: 'Select environment to push secrets to:',
        choices: validEnvs.map((r) => ({
          name: `${r.env}${r.projectId ? ` (${r.projectId})` : ''}`,
          value: r.env,
        })),
      },
    ]);

    logger.newline();
    logger.info(`Pushing secrets to ${selectedEnv}...`);
    logger.newline();

    // Call cloud-secrets:push command
    await cloudSecretsPush({ env: selectedEnv });
  } else {
    logger.info('Skipping secrets push. You can push them later with:');
    logger.info(`   npx tsdevstack cloud-secrets:push --env <environment>`);
  }

  logger.newline();
  logger.complete('Cloud initialization complete!');
  logger.newline();
}
