import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';

// Mock context using the shared mocks from globalThis
rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

import { listSecretsWithKeys } from './list-secrets-with-keys';

// Mock dependencies
rs.mock('./load-aws-credentials', { mock: true });
rs.mock('./client-factory', { mock: true });
rs.mock('./list-secrets', { mock: true });
rs.mock('../extract-key-and-scope-from-secret-name', { mock: true });

import { loadAWSCredentials } from './load-aws-credentials';
import { createAWSClient } from './client-factory';
import { listSecrets } from './list-secrets';
import { extractKeyAndScopeFromSecretName } from '../extract-key-and-scope-from-secret-name';

describe('listSecretsWithKeys', () => {
  const mockProjectRoot = '/test/project';
  const mockEnv = 'development';
  const mockProjectName = 'test-project';

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should list and extract secret keys with scopes successfully', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };
      const mockSecretNames = [
        'test-project-shared-API_KEY',
        'test-project-auth-service-DB_PASSWORD',
        'test-project-shared-JWT_SECRET',
      ];

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretNames);
      rs.mocked(extractKeyAndScopeFromSecretName)
        .mockReturnValueOnce({ key: 'API_KEY', scope: 'shared' })
        .mockReturnValueOnce({ key: 'DB_PASSWORD', scope: 'auth-service' })
        .mockReturnValueOnce({ key: 'JWT_SECRET', scope: 'shared' });

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([
        { key: 'API_KEY', scope: 'shared' },
        { key: 'DB_PASSWORD', scope: 'auth-service' },
        { key: 'JWT_SECRET', scope: 'shared' },
      ]);
      expect(loadAWSCredentials).toHaveBeenCalledWith(mockProjectRoot, mockEnv);
      expect(createAWSClient).toHaveBeenCalledWith(mockCredentials);
      expect(listSecrets).toHaveBeenCalledWith(mockClient, mockProjectName);
      expect(extractKeyAndScopeFromSecretName).toHaveBeenCalledTimes(3);
    });

    it('should filter out secrets that cannot be parsed', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };
      const mockSecretNames = [
        'test-project-shared-VALID_KEY',
        'malformed-secret-name',
        'test-project-auth-service-ANOTHER_KEY',
      ];

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretNames);
      rs.mocked(extractKeyAndScopeFromSecretName)
        .mockReturnValueOnce({ key: 'VALID_KEY', scope: 'shared' })
        .mockReturnValueOnce(null) // Cannot parse
        .mockReturnValueOnce({ key: 'ANOTHER_KEY', scope: 'auth-service' });

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([
        { key: 'VALID_KEY', scope: 'shared' },
        { key: 'ANOTHER_KEY', scope: 'auth-service' },
      ]);
    });
  });

  describe('Edge cases', () => {
    it('should return empty array when no secrets exist', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue([]);

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([]);
      expect(extractKeyAndScopeFromSecretName).not.toHaveBeenCalled();
    });

    it('should handle all unparseable secret names', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };
      const mockSecretNames = ['bad-name-1', 'bad-name-2'];

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(listSecrets).mockResolvedValue(mockSecretNames);
      rs.mocked(extractKeyAndScopeFromSecretName).mockReturnValue(null); // All unparseable

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
      rs.mocked(loadAWSCredentials).mockImplementation(() => {
        throw mockError;
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from AWS');
    });

    it('should throw CliError when client creation fails', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockImplementation(() => {
        throw new Error('Client creation failed');
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from AWS');
    });

    it('should throw CliError when listing secrets fails', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(listSecrets).mockRejectedValue(new Error('API error'));

      try {
        await listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CliError');
        const cliError = error as Error & { context?: string; hint?: string };
        expect(cliError.context).toBe('AWS Secret List Error');
        expect(cliError.hint).toContain('Check that your AWS credentials');
      }
    });
  });
});
