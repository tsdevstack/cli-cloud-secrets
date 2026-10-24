import { describe, it, expect, rs, beforeEach, afterEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { AzureCredentials } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';
import { cloudInit } from './cloud-init';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

// Mock context using shared mocks
rs.mock('../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

rs.mock('inquirer', { mock: true });
rs.mock('./cloud-secrets-push', { mock: true });
rs.mock('../utils/gcp/testing', { mock: true });
rs.mock('../utils/aws/testing', { mock: true });
rs.mock('../utils/azure/testing', { mock: true });
rs.mock('node:child_process', () => ({
  execSync: rs.fn(),
}));

import inquirer from 'inquirer';
import { cloudSecretsPush } from './cloud-secrets-push';
import { testAllGCPEnvironments } from '../utils/gcp/testing';
import { testAllAWSEnvironments } from '../utils/aws/testing';
import {
  testAllAzureEnvironments,
  ensureKeyVaultExists,
  registerResourceProviders,
} from '../utils/azure/testing';
import type { EnvTestResult } from '../utils/types';

describe('cloudInit', () => {
  const mockProjectRoot = '/test/project';
  const mockConfigPath = '/test/project/.tsdevstack/config.json';
  const mockConfig = {
    project: { name: 'test-project', version: '1.0.0' },
    cloud: { provider: null },
    services: [],
  };

  let processExitSpy: ReturnType<
    typeof rs.spyOn<[code?: number | string | null | undefined], never>
  >;

  beforeEach(() => {
    rs.resetAllMocks();
    processExitSpy = rs.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  describe('Input validation', () => {
    it('should exit if project root not found', async () => {
      mocks.findProjectRoot.mockReturnValue('');

      await expect(cloudInit()).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Could not find project root (.tsdevstack/config.json)',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if invalid provider option provided', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );

      await expect(cloudInit('invalid')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Invalid provider: invalid',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Valid providers: gcp, aws, azure',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Provider selection', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
      });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should use provider from command option (GCP)', async () => {
      const mockResults: EnvTestResult[] = [
        { env: 'dev', valid: true, projectId: 'test-gcp-project' },
      ];
      rs.mocked(testAllGCPEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(mocks.logger.info).toHaveBeenCalledWith('Using provider: GCP');
      expect(inquirer.prompt).not.toHaveBeenCalledWith([
        expect.objectContaining({ name: 'provider' }),
      ]);
      expect(mocks.writeJsonFile).toHaveBeenCalledWith(mockConfigPath, {
        cloud: { provider: 'gcp' },
      });
    });

    it('should use provider from command option (AWS)', async () => {
      const mockResults: EnvTestResult[] = [{ env: 'staging', valid: true }];
      rs.mocked(testAllAWSEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('aws');

      expect(mocks.logger.info).toHaveBeenCalledWith('Using provider: AWS');
      expect(mocks.writeJsonFile).toHaveBeenCalledWith(mockConfigPath, {
        cloud: { provider: 'aws' },
      });
    });

    it('should use provider from command option (Azure)', async () => {
      const mockResults: EnvTestResult[] = [{ env: 'prod', valid: true }];
      mocks.loadCredentialsFile.mockReturnValue({
        prod: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          location: 'eastus',
        } as AzureCredentials,
      });
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: true,
        registering: [],
        unregistered: [],
      });
      rs.mocked(ensureKeyVaultExists).mockResolvedValue({
        exists: true,
        created: false,
      });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(mocks.logger.info).toHaveBeenCalledWith('Using provider: AZURE');
      expect(mocks.writeJsonFile).toHaveBeenCalledWith(mockConfigPath, {
        cloud: { provider: 'azure' },
      });
    });

    it('should prompt for provider when not provided', async () => {
      const mockResults: EnvTestResult[] = [
        { env: 'dev', valid: true, projectId: 'test-gcp' },
      ];
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ provider: 'gcp' })
        .mockResolvedValueOnce({ pushSecrets: false });
      rs.mocked(testAllGCPEnvironments).mockResolvedValue(mockResults);

      await cloudInit();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
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
        }),
      ]);
    });
  });

  describe('Config update', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
      });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should create cloud object if missing in config', async () => {
      mocks.readJsonFile.mockReturnValue({});
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([
        { env: 'dev', valid: true, projectId: 'test-gcp' },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(mocks.writeJsonFile).toHaveBeenCalledWith(mockConfigPath, {
        cloud: { provider: 'gcp' },
      });
    });

    it('should update existing cloud object', async () => {
      mocks.readJsonFile.mockReturnValue({
        cloud: { provider: 'old-provider' },
      });
      rs.mocked(testAllAWSEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('aws');

      expect(mocks.writeJsonFile).toHaveBeenCalledWith(mockConfigPath, {
        cloud: { provider: 'aws' },
      });
    });
  });

  describe('Credentials validation', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
    });

    it('should validate credentials for duplicate usage', async () => {
      const mockCredentials = {
        dev: { project_id: 'project-1', region: 'us-central1' },
        staging: { project_id: 'project-2', region: 'us-central1' },
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([
        { env: 'dev', valid: true, projectId: 'project-1' },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(mocks.validateDuplicateCredentials).toHaveBeenCalledWith(
        mockCredentials,
        'gcp',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        'All environments use unique credentials',
      );
    });

    it('should exit if duplicate credentials detected', async () => {
      const mockCredentials = {
        dev: { project_id: 'same-project' },
        staging: { project_id: 'same-project' },
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      mocks.validateDuplicateCredentials.mockImplementation(() => {
        throw new Error(
          'Duplicate GCP project_id detected across environments',
        );
      });

      await expect(cloudInit('gcp')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Duplicate GCP project_id detected across environments',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Please ensure each environment uses separate cloud resources.',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Azure-specific setup', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should register resource providers for Azure', async () => {
      const mockCredentials = {
        dev: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          location: 'eastus',
        } as AzureCredentials,
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: true,
        registering: [],
        unregistered: [],
      });
      rs.mocked(ensureKeyVaultExists).mockResolvedValue({
        exists: true,
        created: false,
      });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(registerResourceProviders).toHaveBeenCalledWith(
        mockCredentials.dev,
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  All resource providers registered for dev',
      );
    });

    it('should say which providers it started registering', async () => {
      mocks.loadCredentialsFile.mockReturnValue({
        dev: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          location: 'eastus',
        } as AzureCredentials,
      });
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: true,
        registering: ['Microsoft.App', 'Microsoft.Cdn'],
        unregistered: [],
      });
      rs.mocked(ensureKeyVaultExists).mockResolvedValue({
        exists: true,
        created: false,
      });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  Registering 2 resource providers for dev (Azure takes a few minutes): Microsoft.App, Microsoft.Cdn',
      );
    });

    it('should create Key Vault for each Azure environment', async () => {
      const mockCredentials = {
        dev: {
          subscriptionId: 'sub-dev',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-dev',
          location: 'eastus',
        } as AzureCredentials,
        staging: {
          subscriptionId: 'sub-staging',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-staging',
          location: 'westus',
        } as AzureCredentials,
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: true,
        registering: [],
        unregistered: [],
      });
      rs.mocked(ensureKeyVaultExists)
        .mockResolvedValueOnce({ exists: true, created: true })
        .mockResolvedValueOnce({ exists: true, created: false });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
        { env: 'staging', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(ensureKeyVaultExists).toHaveBeenCalledWith(
        'test-project',
        'dev',
        mockCredentials.dev,
      );
      expect(ensureKeyVaultExists).toHaveBeenCalledWith(
        'test-project',
        'staging',
        mockCredentials.staging,
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  Created Key Vault for dev',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  Key Vault already exists for staging',
      );
    });

    it('should handle Azure setup errors gracefully', async () => {
      const mockCredentials = {
        dev: {
          subscriptionId: 'sub-123',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-123',
          location: 'eastus',
        } as AzureCredentials,
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: false,
        registering: [],
        unregistered: ['Microsoft.App'],
        error: 'Permission denied',
      });
      rs.mocked(ensureKeyVaultExists).mockResolvedValue({
        exists: false,
        created: false,
        error: 'Failed to create vault',
      });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        '  Failed to register providers for dev: Permission denied',
      );
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Failed to setup Azure resources: Failed to register providers for dev: Permission denied',
      );
    });
  });

  describe('Environment testing', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
      });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should test all GCP environments', async () => {
      const mockResults: EnvTestResult[] = [
        { env: 'dev', valid: true, projectId: 'dev-project' },
        { env: 'staging', valid: true, projectId: 'staging-project' },
      ];
      rs.mocked(testAllGCPEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(testAllGCPEnvironments).toHaveBeenCalledWith(mockProjectRoot);
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '2 environments detected: dev, staging',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        'Connection successful to:',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('  dev (dev-project)');
      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  staging (staging-project)',
      );
    });

    it('should test all AWS environments', async () => {
      const mockResults: EnvTestResult[] = [
        { env: 'dev', valid: true },
        { env: 'prod', valid: true },
      ];
      rs.mocked(testAllAWSEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('aws');

      expect(testAllAWSEnvironments).toHaveBeenCalledWith(mockProjectRoot);
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '2 environments detected: dev, prod',
      );
    });

    it('should test all Azure environments', async () => {
      const mockCredentials = {
        dev: {} as AzureCredentials,
      };
      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);
      rs.mocked(registerResourceProviders).mockResolvedValue({
        success: true,
        registering: [],
        unregistered: [],
      });
      rs.mocked(ensureKeyVaultExists).mockResolvedValue({
        exists: true,
        created: false,
      });
      rs.mocked(testAllAzureEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('azure');

      expect(testAllAzureEnvironments).toHaveBeenCalledWith(mockProjectRoot);
    });

    it('should handle mixed valid and invalid environments', async () => {
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
        staging: { region: 'us-central1' },
        prod: { region: 'us-central1' },
      });
      const mockResults: EnvTestResult[] = [
        { env: 'dev', valid: true, projectId: 'dev-project' },
        { env: 'staging', valid: false, error: 'Invalid credentials' },
        { env: 'prod', valid: true, projectId: 'prod-project' },
      ];
      rs.mocked(testAllGCPEnvironments).mockResolvedValue(mockResults);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(mocks.logger.success).toHaveBeenCalledWith(
        'Connection successful to:',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('  dev (dev-project)');
      expect(mocks.logger.success).toHaveBeenCalledWith(
        '  prod (prod-project)',
      );
      expect(mocks.logger.error).toHaveBeenCalledWith('Connection failed for:');
      expect(mocks.logger.error).toHaveBeenCalledWith(
        '  staging: Invalid credentials',
      );
    });

    it('should exit if no environments found', async () => {
      mocks.loadCredentialsFile.mockReturnValue({});
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([]);

      await expect(cloudInit('gcp')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'No environments found in credentials file!',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Please add environments to .tsdevstack/.credentials.gcp.json',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if all environments fail', async () => {
      rs.mocked(testAllAWSEnvironments).mockResolvedValue([
        { env: 'dev', valid: false, error: 'Bad credentials' },
        { env: 'staging', valid: false, error: 'Region not found' },
      ]);

      await expect(cloudInit('aws')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'All environment credentials failed!',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Please check your credentials file and try again.',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Secrets push workflow', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
        staging: { region: 'us-central1' },
      });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should prompt to push secrets and allow selection', async () => {
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([
        { env: 'dev', valid: true, projectId: 'dev-project' },
        { env: 'staging', valid: true, projectId: 'staging-project' },
      ]);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ pushSecrets: true })
        .mockResolvedValueOnce({ selectedEnv: 'staging' });
      rs.mocked(cloudSecretsPush).mockResolvedValue(undefined);

      await cloudInit('gcp');

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'pushSecrets',
          message:
            'Do you want to generate cloud secrets? (you can select environment in the next step)',
          default: true,
        }),
      ]);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'select',
          name: 'selectedEnv',
          message: 'Select environment to push secrets to:',
          choices: [
            { name: 'dev (dev-project)', value: 'dev' },
            { name: 'staging (staging-project)', value: 'staging' },
          ],
        }),
      ]);
      expect(cloudSecretsPush).toHaveBeenCalledWith({ env: 'staging' });
    });

    it('should skip push when declined', async () => {
      rs.mocked(testAllAWSEnvironments).mockResolvedValue([
        { env: 'dev', valid: true },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('aws');

      expect(cloudSecretsPush).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Skipping secrets push. You can push them later with:',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   npx tsdevstack cloud-secrets:push --env <environment>',
      );
    });

    it('should only show valid environments for push selection', async () => {
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
        staging: { region: 'us-central1' },
        prod: { region: 'us-central1' },
      });
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([
        { env: 'dev', valid: true, projectId: 'dev-project' },
        { env: 'staging', valid: false, error: 'Bad creds' },
        { env: 'prod', valid: true, projectId: 'prod-project' },
      ]);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ pushSecrets: true })
        .mockResolvedValueOnce({ selectedEnv: 'dev' });
      rs.mocked(cloudSecretsPush).mockResolvedValue(undefined);

      await cloudInit('gcp');

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          choices: [
            { name: 'dev (dev-project)', value: 'dev' },
            { name: 'prod (prod-project)', value: 'prod' },
          ],
        }),
      ]);
    });
  });

  describe('Completion', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getConfigPath.mockReturnValue(mockConfigPath);
      mocks.readJsonFile.mockReturnValue({ cloud: {} });
      mocks.loadCredentialsFile.mockReturnValue({
        dev: { region: 'us-central1' },
      });
      mocks.validateDuplicateCredentials.mockReturnValue(undefined);
    });

    it('should show completion message', async () => {
      rs.mocked(testAllGCPEnvironments).mockResolvedValue([
        { env: 'dev', valid: true, projectId: 'test-gcp' },
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ pushSecrets: false });

      await cloudInit('gcp');

      expect(mocks.logger.complete).toHaveBeenCalledWith(
        'Cloud initialization complete!',
      );
    });
  });
});
