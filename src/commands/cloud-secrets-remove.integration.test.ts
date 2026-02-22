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

import { cloudSecretsRemove } from './cloud-secrets-remove';

// Mock all dependencies
rs.mock('inquirer', { mock: true });
rs.mock('../utils/gcp/load-gcp-credentials', { mock: true });
rs.mock('../utils/gcp/client-factory', { mock: true });
rs.mock('../utils/aws/remove-secret-by-name', { mock: true });
rs.mock('../utils/azure/remove-secret-by-name', { mock: true });

import inquirer from 'inquirer';
import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { removeSecretByName as removeAWSSecretByName } from '../utils/aws/remove-secret-by-name';
import { removeSecretByName as removeAzureSecretByName } from '../utils/azure/remove-secret-by-name';

describe('cloudSecretsRemove', () => {
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
    it('should exit if no key provided', async () => {
      await expect(
        cloudSecretsRemove(undefined, { env: 'dev' }),
      ).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith('Secret key is required');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if project root not found', async () => {
      mocks.findProjectRoot.mockReturnValue('');

      await expect(
        cloudSecretsRemove('API_KEY', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

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

      await expect(
        cloudSecretsRemove('API_KEY', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

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

      await expect(cloudSecretsRemove('API_KEY', {})).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'No environments found in credentials file!',
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
      mocks.buildSecretName.mockReturnValue('test-project-shared-API_KEY');
      mocks.isFile.mockReturnValue(false);
    });

    it('should prompt for environment if not provided', async () => {
      mocks.getAvailableEnvironments.mockReturnValue([
        'dev',
        'staging',
        'prod',
      ]);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ env: 'prod' })
        .mockResolvedValueOnce({ confirm: false }); // Cancel deletion
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );

      await expect(cloudSecretsRemove('API_KEY', {})).rejects.toThrow(
        'process.exit',
      );

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'env',
          message: 'Select environment to remove secret from:',
          choices: ['dev', 'staging', 'prod'],
        }),
      ]);
    });
  });

  describe('Confirmation prompt', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.buildSecretName.mockReturnValue('test-project-shared-API_KEY');
      mocks.isFile.mockReturnValue(false);
    });

    it('should prompt for confirmation before deleting', async () => {
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ confirm: false }); // Cancel
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );

      await expect(
        cloudSecretsRemove('API_KEY', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'This will permanently delete the secret from cloud!',
      );
      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to delete API_KEY?',
          default: false,
        }),
      ]);
      expect(mocks.logger.info).toHaveBeenCalledWith('Cancelled');
    });

    it('should skip confirmation with --force flag', async () => {
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue({
        deleteSecret: rs.fn(),
      } as unknown as ReturnType<typeof createGCPClient>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('API_KEY', { env: 'dev', force: true });

      expect(inquirer.prompt).not.toHaveBeenCalledWith([
        expect.objectContaining({ name: 'confirm' }),
      ]);
    });

    it('should show extra warning for framework secrets', async () => {
      mocks.isFile.mockReturnValue(true);
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          KONG_ADMIN_KEY: 'test-key',
          AUTH_SECRET: 'test-secret',
        },
      });
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ confirm: false });
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        {} as ReturnType<typeof createGCPClient>,
      );

      await expect(
        cloudSecretsRemove('KONG_ADMIN_KEY', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'FRAMEWORK SECRET DETECTED!',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   KONG_ADMIN_KEY is a framework-managed secret',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   Removing it may break your application until regenerated',
      );
    });
  });

  describe('GCP provider', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.buildSecretName.mockReturnValue('test-project-shared-DB_PASSWORD');
      mocks.isFile.mockReturnValue(false);
    });

    it('should remove GCP secret successfully', async () => {
      const mockClient = {
        deleteSecret: rs.fn().mockResolvedValue([]),
      };
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp-project',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('DB_PASSWORD', { env: 'dev' });

      expect(mockClient.deleteSecret).toHaveBeenCalledWith({
        name: 'projects/test-gcp-project/secrets/test-project-shared-DB_PASSWORD',
      });
      expect(mocks.logger.success).toHaveBeenCalledWith('Removed from cloud');
    });

    it('should handle GCP secret not found gracefully', async () => {
      const mockClient = {
        deleteSecret: rs.fn().mockRejectedValue(new Error('NOT_FOUND')),
      };
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp-project',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('DB_PASSWORD', { env: 'dev' });

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Secret not found in cloud (may have been already deleted)',
      );
    });

    it('should handle GCP deletion errors', async () => {
      const mockClient = {
        deleteSecret: rs.fn().mockRejectedValue(new Error('Permission denied')),
      };
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp-project',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ confirm: true });

      await expect(
        cloudSecretsRemove('DB_PASSWORD', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Failed to remove secret from cloud',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Error: Permission denied',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
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
      mocks.buildSecretName.mockReturnValue('test-project-shared-STRIPE_KEY');
      mocks.isFile.mockReturnValue(false);
    });

    it('should remove AWS secret successfully', async () => {
      rs.mocked(removeAWSSecretByName).mockResolvedValue({ success: true });
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('STRIPE_KEY', { env: 'staging' });

      expect(removeAWSSecretByName).toHaveBeenCalledWith(
        mockProjectRoot,
        'staging',
        'test-project-shared-STRIPE_KEY',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('Removed from cloud');
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
      mocks.buildSecretName.mockReturnValue('test-project-shared-REDIS-URL');
      mocks.isFile.mockReturnValue(false);
    });

    it('should remove Azure secret successfully with naming warning', async () => {
      rs.mocked(removeAzureSecretByName).mockResolvedValue({ success: true });
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('REDIS_URL', { env: 'prod' });

      expect(mocks.logger.warn).toHaveBeenCalledWith('Azure Key Vault Naming:');
      expect(removeAzureSecretByName).toHaveBeenCalledWith(
        mockProjectRoot,
        'prod',
        'test-project',
        'test-project-shared-REDIS-URL',
      );
      expect(mocks.logger.success).toHaveBeenCalledWith('Removed from cloud');
    });
  });

  describe('Local file removal', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.buildSecretName.mockReturnValue('test-project-shared-API_KEY');
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue({
        deleteSecret: rs.fn(),
      } as unknown as ReturnType<typeof createGCPClient>);
    });

    it('should prompt to remove from local file', async () => {
      mocks.isFile.mockReturnValue(false);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: true });

      await cloudSecretsRemove('API_KEY', { env: 'dev' });

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'removeLocal',
          message: 'Remove from local .secrets.user.json as well?',
          default: true,
        }),
      ]);
    });

    it('should remove from .secrets.user.json when confirmed', async () => {
      const userSecretsPath = '/test/project/.secrets.user.json';
      mocks.isFile.mockImplementation((path: string) => {
        if (path === userSecretsPath) return true;
        return false;
      });
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          API_KEY: 'test-key',
          OTHER_SECRET: 'other-value',
        },
      });
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: true });

      await cloudSecretsRemove('API_KEY', { env: 'dev' });

      expect(mocks.writeJsonFile).toHaveBeenCalledWith(userSecretsPath, {
        secrets: {
          OTHER_SECRET: 'other-value',
        },
      });
      expect(mocks.logger.success).toHaveBeenCalledWith(
        'Removed from .secrets.user.json',
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith('Remember to run:');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   npx tsdevstack generate-secrets',
      );
    });

    it('should handle secret not in .secrets.user.json', async () => {
      const userSecretsPath = '/test/project/.secrets.user.json';
      mocks.isFile.mockImplementation((path: string) => {
        if (path === userSecretsPath) return true;
        return false;
      });
      mocks.readJsonFile.mockReturnValue({
        secrets: {
          OTHER_SECRET: 'other-value',
        },
      });
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: true });

      await cloudSecretsRemove('API_KEY', { env: 'dev' });

      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Secret not found in .secrets.user.json (skipped)',
      );
    });

    it('should skip local removal when declined', async () => {
      mocks.isFile.mockReturnValue(false);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('API_KEY', { env: 'dev' });

      expect(mocks.writeJsonFile).not.toHaveBeenCalled();
    });
  });

  describe('Completion', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.buildSecretName.mockReturnValue('test-project-shared-API_KEY');
      mocks.isFile.mockReturnValue(false);
      rs.mocked(loadGCPCredentials).mockReturnValue({
        project_id: 'test-gcp',
      } as ReturnType<typeof loadGCPCredentials>);
      rs.mocked(createGCPClient).mockReturnValue({
        deleteSecret: rs.fn(),
      } as unknown as ReturnType<typeof createGCPClient>);
    });

    it('should show completion message', async () => {
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ removeLocal: false });

      await cloudSecretsRemove('API_KEY', { env: 'dev' });

      expect(mocks.logger.complete).toHaveBeenCalledWith(
        'Secret removed successfully!',
      );
    });
  });
});
