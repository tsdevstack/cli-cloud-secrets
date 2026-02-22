import { describe, it, expect, rs, beforeEach, afterEach } from '@rstest/core';
import type { PluginContext } from 'tsdevstack/plugin';
import type { MockContext } from '../test-utils/mock-context';

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

import { cloudSecretsDiff } from './cloud-secrets-diff';

// Mock all dependencies
rs.mock('inquirer', { mock: true });
rs.mock('../utils/gcp/load-gcp-credentials', { mock: true });
rs.mock('../utils/gcp/client-factory', { mock: true });
rs.mock('../utils/gcp/list-secrets-with-keys', { mock: true });
rs.mock('../utils/aws/list-secrets-with-keys', { mock: true });
rs.mock('../utils/azure/list-secrets-with-keys', { mock: true });

import inquirer from 'inquirer';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { listSecretsWithKeys as listGCPSecretsWithKeys } from '../utils/gcp/list-secrets-with-keys';
import { listSecretsWithKeys as listAWSSecretsWithKeys } from '../utils/aws/list-secrets-with-keys';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from '../utils/azure/list-secrets-with-keys';
describe('cloudSecretsDiff', () => {
  const mockProjectRoot = '/test/project';
  const mockConfig = {
    project: { name: 'test-project', version: '1.0.0' },
    cloud: { provider: 'gcp' as const },
    services: [],
  };

  let processExitSpy: ReturnType<
    typeof rs.spyOn<[code?: number | string | null | undefined], never>
  >;

  beforeEach(() => {
    rs.clearAllMocks();
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

      await expect(cloudSecretsDiff('dev')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Could not find project root (.tsdevstack/config.json)',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if provider not configured', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'test-project', version: '1.0.0' },
        cloud: { provider: null },
        services: [],
      });

      await expect(cloudSecretsDiff('dev')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Cloud provider not configured in config.json',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if no environments found', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue([]);

      await expect(cloudSecretsDiff()).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'No environments found in credentials file!',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if .secrets.local.json not found', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.isFile.mockReturnValue(false);

      await expect(cloudSecretsDiff('dev')).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        '.secrets.local.json not found',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Please generate secrets first:',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   npx tsdevstack generate-secrets',
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
      mocks.isFile.mockReturnValue(true);
      mocks.readJsonFile.mockReturnValue({ secrets: {} });
    });

    it('should prompt for environment if not provided', async () => {
      mocks.getAvailableEnvironments.mockReturnValue([
        'dev',
        'staging',
        'prod',
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ env: 'staging' });
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);

      await cloudSecretsDiff();

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'env',
          message: 'Select environment to compare:',
          choices: ['dev', 'staging', 'prod'],
        }),
      ]);
    });

    it('should use provided environment', async () => {
      mocks.getAvailableEnvironments.mockReturnValue(['dev', 'staging']);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);

      await cloudSecretsDiff('staging');

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mocks.logger.loading).toHaveBeenCalledWith('Environment: staging');
    });
  });

  describe('GCP provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.isFile.mockReturnValue(true);
    });

    it('should compare GCP secrets with local secrets', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          KONG_ADMIN_KEY: 'local-value',
          AUTH_SECRET: 'local-secret',
          DATABASE_URL: 'local-db',
        },
      });
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'KONG_ADMIN_KEY', scope: 'shared' },
        { key: 'AUTH_SECRET', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(loadGCPCredentials).toHaveBeenCalledWith(mockProjectRoot, 'dev');
      expect(listGCPSecretsWithKeys).toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in cloud (2):');
      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in local (3):');
    });
  });

  describe('AWS provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        ...mockConfig,
        cloud: { provider: 'aws' },
      } as ReturnType<typeof mocks.loadFrameworkConfig>);
      mocks.getAvailableEnvironments.mockReturnValue(['staging']);
      mocks.isFile.mockReturnValue(true);
    });

    it('should compare AWS secrets with local secrets', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          API_KEY: 'test-key',
        },
      });
      rs.mocked(listAWSSecretsWithKeys).mockResolvedValue([
        { key: 'API_KEY', scope: 'shared' },
      ]);

      await cloudSecretsDiff('staging');

      expect(listAWSSecretsWithKeys).toHaveBeenCalledWith(
        mockProjectRoot,
        'staging',
        'test-project',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in cloud (1):');
      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in local (1):');
    });
  });

  describe('Azure provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        ...mockConfig,
        cloud: { provider: 'azure' },
      } as ReturnType<typeof mocks.loadFrameworkConfig>);
      mocks.getAvailableEnvironments.mockReturnValue(['prod']);
      mocks.isFile.mockReturnValue(true);
    });

    it('should compare Azure secrets with naming warning', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          REDIS_URL: 'redis://localhost',
        },
      });
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue(['REDIS_URL']);

      await cloudSecretsDiff('prod');

      expect(mocks.logger.warn).toHaveBeenCalledWith('Azure Key Vault Naming:');
      expect(listAzureSecretsWithKeys).toHaveBeenCalledWith(
        mockProjectRoot,
        'prod',
        'test-project',
      );
    });
  });

  describe('Secret filtering', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
      mocks.isFile.mockReturnValue(true);
    });

    it('should filter out metadata fields from local secrets', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          $comment: 'metadata',
          REAL_SECRET: 'value',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'REAL_SECRET', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.loading).toHaveBeenCalledWith('Local secrets: 1');
    });

    it('should filter out local-only secrets (NODE_ENV, SECRETS_PROVIDER)', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          NODE_ENV: 'development',
          SECRETS_PROVIDER: 'local',
          KONG_SERVICE_HOST: 'host.docker.internal',
          REAL_SECRET: 'value',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'REAL_SECRET', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.loading).toHaveBeenCalledWith('Local secrets: 1');
    });
  });

  describe('Comparison results', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.isFile.mockReturnValue(true);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
    });

    it('should show secrets only in local', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value1',
          SECRET_2: 'value2',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'SECRET_1', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.warn).toHaveBeenCalledWith('Differences (1):');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   SECRET_2: exists in local, missing in cloud',
      );
    });

    it('should show secrets only in cloud', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value1',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'SECRET_1', scope: 'shared' },
        { key: 'SECRET_2', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.warn).toHaveBeenCalledWith('Differences (1):');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   SECRET_2: exists in cloud, missing in local',
      );
    });

    it('should show no differences when secrets match', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value1',
          SECRET_2: 'value2',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'SECRET_1', scope: 'shared' },
        { key: 'SECRET_2', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Differences'),
      );
    });

    it('should show summary statistics', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value1',
          SECRET_2: 'value2',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'SECRET_1', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.summary).toHaveBeenCalledWith('Summary:');
      expect(mocks.logger.info).toHaveBeenCalledWith('   Local: 2');
      expect(mocks.logger.info).toHaveBeenCalledWith('   Cloud: 1');
      expect(mocks.logger.info).toHaveBeenCalledWith('   Match: 1');
      expect(mocks.logger.info).toHaveBeenCalledWith('   Diff:  1');
    });
  });

  describe('Output format', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.isFile.mockReturnValue(true);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );
    });

    it('should display cloud secrets list', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {},
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'SECRET_A', scope: 'shared' },
        { key: 'SECRET_B', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in cloud (2):');
      expect(mocks.logger.info).toHaveBeenCalledWith('   SECRET_A');
      expect(mocks.logger.info).toHaveBeenCalledWith('   SECRET_B');
    });

    it('should display local secrets list', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          LOCAL_A: 'value-a',
          LOCAL_B: 'value-b',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([]);

      await cloudSecretsDiff('dev');

      expect(mocks.logger.info).toHaveBeenCalledWith('Keys in local (2):');
      expect(mocks.logger.info).toHaveBeenCalledWith('   LOCAL_A');
      expect(mocks.logger.info).toHaveBeenCalledWith('   LOCAL_B');
    });

    it('should sort secret lists alphabetically', async () => {
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          Z_SECRET: 'value-z',
          A_SECRET: 'value-a',
          M_SECRET: 'value-m',
        },
      });
      rs.mocked(listGCPSecretsWithKeys).mockResolvedValue([
        { key: 'Z_CLOUD', scope: 'shared' },
        { key: 'A_CLOUD', scope: 'shared' },
        { key: 'M_CLOUD', scope: 'shared' },
      ]);

      await cloudSecretsDiff('dev');

      // Verify sorted order by checking the sequence of calls
      const calls = rs
        .mocked(mocks.logger.info)
        .mock.calls.map((call: unknown[]) => call[0])
        .filter(
          (msg: unknown) => typeof msg === 'string' && msg.startsWith('   '),
        );

      const cloudCalls = calls.slice(0, 3);
      expect(cloudCalls).toEqual(['   A_CLOUD', '   M_CLOUD', '   Z_CLOUD']);

      const localCalls = calls.slice(3, 6);
      expect(localCalls).toEqual(['   A_SECRET', '   M_SECRET', '   Z_SECRET']);
    });
  });
});
