import { describe, it, expect, rs, beforeEach, afterEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';
import { cloudSecretsList } from './cloud-secrets-list';

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

// Mock all dependencies
rs.mock('../utils/gcp/load-gcp-credentials', { mock: true });
rs.mock('../utils/gcp/client-factory', { mock: true });
rs.mock('../utils/gcp/list-secrets-with-keys', { mock: true });
rs.mock('../utils/aws/list-secrets-with-keys', { mock: true });
rs.mock('../utils/azure/list-secrets-with-keys', { mock: true });
rs.mock('inquirer', { mock: true });
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { listSecretsWithKeys as listGCPSecretsWithKeys } from '../utils/gcp/list-secrets-with-keys';
import { listSecretsWithKeys as listAWSSecretsWithKeys } from '../utils/aws/list-secrets-with-keys';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from '../utils/azure/list-secrets-with-keys';
import inquirer from 'inquirer';

describe('cloudSecretsList', () => {
  const mockProjectRoot = '/test/project';
  const mockConfig = {
    project: { name: 'test-project' },
    cloud: { provider: 'gcp' },
    services: [] as Array<{ name: string }>,
  };

  let consoleLogSpy: ReturnType<typeof rs.spyOn>;
  let processExitSpy: ReturnType<
    typeof rs.spyOn<[code?: number | string | null | undefined], never>
  >;

  beforeEach(() => {
    rs.clearAllMocks();
    consoleLogSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = rs.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as () => never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Project root validation', () => {
    it('should exit if project root not found', async () => {
      mocks.findProjectRoot.mockReturnValue('' as unknown as string);

      await expect(cloudSecretsList({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Could not find project root (.tsdevstack/config.json)',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Provider validation', () => {
    it('should exit if provider not configured', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'test-project', version: '1.0.0' },
        cloud: { provider: null },
        services: [],
      } as ReturnType<typeof mocks.loadFrameworkConfig>);

      await expect(cloudSecretsList({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Cloud provider not configured in config.json',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Environment selection', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
    });

    it('should prompt for environment if not provided', async () => {
      mocks.getAvailableEnvironments.mockReturnValue([
        'dev',
        'staging',
        'prod',
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValue({ env: 'staging' });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );

      await cloudSecretsList({});

      expect(mocks.getAvailableEnvironments).toHaveBeenCalledWith(
        mockProjectRoot,
        'gcp',
      );
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'select',
          name: 'env',
          message: 'Select environment to list secrets from:',
          choices: ['dev', 'staging', 'prod'],
        }),
      ]);
    });

    it('should exit if no environments available', async () => {
      mocks.getAvailableEnvironments.mockReturnValue([]);

      await expect(cloudSecretsList({})).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'No environments found in credentials file!',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should use provided environment without prompting', async () => {
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );

      await cloudSecretsList({ env: 'production' });

      expect(mocks.getAvailableEnvironments).not.toHaveBeenCalled();
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });

  describe('GCP provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
    });

    it('should list GCP secrets', async () => {
      const mockCredentials = { project_id: 'test-gcp-project' };
      const mockClient = { listSecrets: rs.fn() };

      rs.mocked(loadGCPCredentials).mockReturnValue(
        mockCredentials as ReturnType<typeof loadGCPCredentials>,
      );
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'API_KEY', scope: 'shared' },
        { key: 'DATABASE_URL', scope: 'shared' },
        { key: 'JWT_SECRET', scope: 'shared' },
      ]);

      await cloudSecretsList({ env: 'dev' });

      expect(loadGCPCredentials).toHaveBeenCalledWith(mockProjectRoot, 'dev');
      expect(createGCPClient).toHaveBeenCalledWith(mockCredentials);
      expect(listGCPSecretsWithKeys).toHaveBeenCalledWith(
        mockClient,
        'test-gcp-project',
        'test-project',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('Total: 3 secret(s)');
    });
  });

  describe('AWS provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'test-project', version: '1.0.0' },
        cloud: { provider: 'aws' },
        services: [],
      } as ReturnType<typeof mocks.loadFrameworkConfig>);
    });

    it('should list AWS secrets', async () => {
      const mockSecrets = [
        { key: 'DB_PASSWORD', scope: 'shared' },
        { key: 'API_TOKEN', scope: 'shared' },
      ];

      rs.mocked(listAWSSecretsWithKeys).mockResolvedValue(mockSecrets);

      await cloudSecretsList({ env: 'staging' });

      expect(listAWSSecretsWithKeys).toHaveBeenCalledWith(
        mockProjectRoot,
        'staging',
        'test-project',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('Total: 2 secret(s)');
    });
  });

  describe('Azure provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        ...mockConfig,
        cloud: { provider: 'azure' },
      } as ReturnType<typeof mocks.loadFrameworkConfig>);
    });

    it('should list Azure secrets with warning', async () => {
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue([
        { key: 'REDIS_URL', scope: 'shared' },
      ]);

      await cloudSecretsList({ env: 'prod' });

      expect(listAzureSecretsWithKeys).toHaveBeenCalledWith(
        mockProjectRoot,
        'prod',
        'test-project',
        [],
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith('Azure Key Vault Naming:');
      expect(mocks.logger.success).toHaveBeenCalledWith('Total: 1 secret(s)');
    });

    it('should group Azure service-scoped secrets under their service', async () => {
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue([
        { key: 'JWT_SECRET', scope: 'shared' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service' },
        { key: 'DATABASE_URL', scope: 'auth-service' },
      ]);

      await cloudSecretsList({ env: 'prod' });

      expect(mocks.logger.info).toHaveBeenCalledWith('Shared secrets (1):');
      expect(mocks.logger.info).toHaveBeenCalledWith('   JWT_SECRET');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Service-specific secrets (1 services):',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith('   auth-service (2):');
      expect(mocks.logger.info).toHaveBeenCalledWith('      ADMIN_EMAILS');
      expect(mocks.logger.info).toHaveBeenCalledWith('      DATABASE_URL');
      expect(mocks.logger.info).not.toHaveBeenCalledWith('   ADMIN_EMAILS');
      expect(mocks.logger.success).toHaveBeenCalledWith('Total: 3 secret(s)');
    });

    it('should put Azure service-scoped secrets under services in JSON output', async () => {
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue([
        { key: 'JWT_SECRET', scope: 'shared' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service' },
        { key: 'DATABASE_URL', scope: 'auth-service' },
      ]);

      await cloudSecretsList({ env: 'prod', json: true });

      const expectedOutput = {
        provider: 'azure',
        project: 'test-project',
        environment: 'prod',
        total: 3,
        shared: ['JWT_SECRET'],
        services: { 'auth-service': ['ADMIN_EMAILS', 'DATABASE_URL'] },
      };

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(expectedOutput, null, 2),
      );
    });
  });

  describe('Output formatting', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
    });

    it('should output JSON when json option is true', async () => {
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'KEY1', scope: 'shared' },
        { key: 'KEY2', scope: 'shared' },
      ]);

      await cloudSecretsList({ env: 'dev', json: true });

      const expectedOutput = {
        provider: 'gcp',
        project: 'test-project',
        environment: 'dev',
        total: 2,
        shared: ['KEY1', 'KEY2'],
        services: {},
      };

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify(expectedOutput, null, 2),
      );
    });

    it('should display grouped secrets in normal output', async () => {
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'DATABASE_URL', scope: 'shared' },
        { key: 'API_KEY', scope: 'shared' },
        { key: 'JWT_SECRET', scope: 'shared' },
      ]);

      await cloudSecretsList({ env: 'dev' });

      expect(mocks.logger.info).toHaveBeenCalledWith('Shared secrets (3):');
      expect(mocks.logger.info).toHaveBeenCalledWith('   API_KEY');
      expect(mocks.logger.info).toHaveBeenCalledWith('   DATABASE_URL');
      expect(mocks.logger.info).toHaveBeenCalledWith('   JWT_SECRET');
    });

    it('should handle empty secrets list', async () => {
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);

      await cloudSecretsList({ env: 'dev' });

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'No secrets found in cloud',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith('To push secrets:');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   npx tsdevstack cloud-secrets:push',
      );
    });
  });
});
