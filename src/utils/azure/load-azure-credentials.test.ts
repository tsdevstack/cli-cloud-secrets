import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from 'tsdevstack/plugin';
import type { MockContext } from '../../test-utils/mock-context';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

// Mock context using the shared mocks
rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

import { loadAzureCredentials } from './load-azure-credentials';

describe('loadAzureCredentials', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Local mode', () => {
    it('should load Azure credentials for specific environment', () => {
      const mockCredentials = {
        dev: {
          clientId: 'dev-client-id',
          clientSecret: 'dev-client-secret',
          tenantId: 'dev-tenant-id',
          keyVaultName: 'dev-keyvault',
        },
        prod: {
          clientId: 'prod-client-id',
          clientSecret: 'prod-client-secret',
          tenantId: 'prod-tenant-id',
          keyVaultName: 'prod-keyvault',
        },
      };

      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

      const result = loadAzureCredentials('/root', 'dev');

      expect(result).toEqual(mockCredentials.dev);
      expect(mocks.loadCredentialsFile).toHaveBeenCalledWith('/root', 'azure');
    });

    it('should load production environment credentials', () => {
      const mockCredentials = {
        prod: {
          clientId: 'prod-client-id',
          clientSecret: 'prod-client-secret',
          tenantId: 'prod-tenant-id',
          keyVaultName: 'prod-keyvault',
        },
      };

      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

      const result = loadAzureCredentials('/root', 'prod');

      expect(result).toEqual(mockCredentials.prod);
    });

    it('should throw error if environment does not exist', () => {
      const mockCredentials = {
        dev: {
          clientId: 'dev-client-id',
          clientSecret: 'dev-client-secret',
          tenantId: 'dev-tenant-id',
          keyVaultName: 'dev-keyvault',
        },
      };

      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

      expect(() => {
        loadAzureCredentials('/root', 'nonexistent');
      }).toThrow('No credentials found for environment "nonexistent"');
    });

    it('should include environment name in error message', () => {
      mocks.loadCredentialsFile.mockReturnValue({});

      try {
        loadAzureCredentials('/root', 'staging');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('staging');
        expect((error as Error).message).toContain('.credentials.azure.json');
      }
    });

    it('should handle credentials file with only one environment', () => {
      const mockCredentials = {
        prod: {
          clientId: 'prod-only',
          clientSecret: 'prod-secret',
          tenantId: 'prod-tenant',
          keyVaultName: 'prod-vault',
        },
      };

      mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

      const result = loadAzureCredentials('/root', 'prod');

      expect(result.clientId).toBe('prod-only');
    });
  });

  describe('CI mode', () => {
    it('should use getAzureCredentialsFromEnv in CI', () => {
      const ciCredentials = {
        clientId: 'ci-client-id',
        tenantId: 'ci-tenant-id',
        subscriptionId: 'ci-subscription-id',
        location: 'eastus',
      };

      mocks.isCIEnv.mockReturnValue(true);
      mocks.getAzureCredentialsFromEnv.mockReturnValue(ciCredentials);

      const result = loadAzureCredentials('/root', 'dev');

      expect(result).toEqual(ciCredentials);
      expect(mocks.getAzureCredentialsFromEnv).toHaveBeenCalled();
      expect(mocks.loadCredentialsFile).not.toHaveBeenCalled();
    });

    it('should not read credentials file in CI', () => {
      mocks.isCIEnv.mockReturnValue(true);
      mocks.getAzureCredentialsFromEnv.mockReturnValue({
        clientId: 'ci-id',
        tenantId: 'ci-tenant',
        subscriptionId: 'ci-sub',
        location: 'westus',
      });

      loadAzureCredentials('/root', 'prod');

      expect(mocks.loadCredentialsFile).not.toHaveBeenCalled();
    });
  });
});
