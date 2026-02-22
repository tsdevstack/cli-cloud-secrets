import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from 'tsdevstack/plugin';
import { listSecretsWithKeys } from './list-secrets-with-keys';

rs.mock('../../context', () => {
  class CliError extends Error {
    context?: string;
    hint?: string;
    constructor(message: string, context?: string, hint?: string) {
      super(message);
      this.name = 'CliError';
      this.context = context;
      this.hint = hint;
    }
  }
  return {
    CliError,
    initContext: rs.fn(),
    getContext: rs.fn(
      () =>
        (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
    ),
    wrapCommand: rs.fn((fn: unknown) => fn),
  };
});

// Mock dependencies
rs.mock('./load-azure-credentials', { mock: true });
rs.mock('./create-azure-client', { mock: true });
rs.mock('./list-secrets', { mock: true });
rs.mock('../extract-key-from-secret-name', { mock: true });

import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { listSecrets } from './list-secrets';
import { extractKeyFromSecretName } from '../extract-key-from-secret-name';

describe('listSecretsWithKeys', () => {
  const mockProjectRoot = '/test/project';
  const mockEnv = 'development';
  const mockProjectName = 'test-project';

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should list and extract secret keys successfully', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};
      const mockSecretsMap = {
        'test-project-shared-DATABASE-URL': 'value1',
        'test-project-shared-API-KEY': 'value2',
        'test-project-shared-JWT-SECRET': 'value3',
      };

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretsMap);
      rs.mocked(extractKeyFromSecretName)
        .mockReturnValueOnce('DATABASE-URL')
        .mockReturnValueOnce('API-KEY')
        .mockReturnValueOnce('JWT-SECRET');

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      // Keys should be transformed from hyphens back to underscores
      expect(result).toEqual(['DATABASE_URL', 'API_KEY', 'JWT_SECRET']);
      expect(loadAzureCredentials).toHaveBeenCalledWith(
        mockProjectRoot,
        mockEnv,
      );
      expect(createAzureClient).toHaveBeenCalledWith(
        mockCredentials,
        mockProjectName,
        mockEnv,
      );
      expect(listSecrets).toHaveBeenCalledWith(mockClient, mockProjectName);
      expect(extractKeyFromSecretName).toHaveBeenCalledTimes(3);
    });

    it('should handle hyphenated keys and convert to underscores', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};
      const mockSecretsMap = {
        'test-project-shared-MULTI-PART-KEY': 'value1',
      };

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretsMap);
      rs.mocked(extractKeyFromSecretName).mockReturnValueOnce('MULTI-PART-KEY');

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual(['MULTI_PART_KEY']);
    });

    it('should filter out secrets that cannot be parsed', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};
      const mockSecretsMap = {
        'test-project-shared-VALID-KEY': 'value1',
        'malformed-secret-name': 'value2',
        'test-project-shared-ANOTHER-KEY': 'value3',
      };

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretsMap);
      rs.mocked(extractKeyFromSecretName)
        .mockReturnValueOnce('VALID-KEY')
        .mockReturnValueOnce(null) // Cannot parse
        .mockReturnValueOnce('ANOTHER-KEY');

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual(['VALID_KEY', 'ANOTHER_KEY']);
    });
  });

  describe('Edge cases', () => {
    it('should return empty array when no secrets exist', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue({});

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([]);
      expect(extractKeyFromSecretName).not.toHaveBeenCalled();
    });

    it('should handle all unparseable secret names', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};
      const mockSecretsMap = {
        'bad-name-1': 'value1',
        'bad-name-2': 'value2',
      };

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretsMap);
      rs.mocked(extractKeyFromSecretName).mockReturnValue(null); // All unparseable

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should throw CliError when credentials loading fails', async () => {
      const mockError = new Error('Credentials not found');
      rs.mocked(loadAzureCredentials).mockImplementation(() => {
        throw mockError;
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from Azure');
    });

    it('should throw CliError when client creation fails', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockImplementation(() => {
        throw new Error('Client creation failed');
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from Azure');
    });

    it('should throw CliError when listing secrets fails', async () => {
      const mockCredentials = {
        tenantId: 'test',
        clientId: 'test',
        clientSecret: 'test',
        subscriptionId: 'test-sub',
        location: 'eastus',
      };
      const mockClient = {};

      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAzureClient>,
      );
      rs.mocked(listSecrets).mockRejectedValue(new Error('API error'));

      try {
        await listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CliError');
        const cliError = error as Error & { context?: string; hint?: string };
        expect(cliError.context).toBe('Azure Secret List Error');
        expect(cliError.hint).toContain('Check that your Azure credentials');
      }
    });
  });
});
