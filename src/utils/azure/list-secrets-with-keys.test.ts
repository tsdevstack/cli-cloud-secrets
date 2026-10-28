import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
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

// Mock Azure I/O; the name parser (parseAzureSecretName) runs for real
rs.mock('./load-azure-credentials', { mock: true });
rs.mock('./create-azure-client', { mock: true });
rs.mock('./list-secrets', { mock: true });

import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { listSecrets } from './list-secrets';

describe('listSecretsWithKeys', () => {
  const mockProjectRoot = '/test/project';
  const mockEnv = 'development';
  const mockProjectName = 'test-project';
  const mockCredentials = {
    tenantId: 'test',
    clientId: 'test',
    clientSecret: 'test',
    subscriptionId: 'test-sub',
    location: 'eastus',
  };
  const mockClient = {};

  function mockSecrets(secretsMap: Record<string, string>): void {
    rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
    rs.mocked(createAzureClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createAzureClient>,
    );
    rs.mocked(listSecrets).mockResolvedValue(secretsMap);
  }

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Service vaults', () => {
    it('should list the shared vault and every existing service vault', async () => {
      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      (
        globalThis as unknown as {
          contextMocks: { keyVaultExists: ReturnType<typeof rs.fn> };
        }
      ).contextMocks.keyVaultExists.mockImplementation(
        async (_c, _p, _e, scope) => scope === 'auth-service',
      );
      rs.mocked(createAzureClient).mockImplementation(
        (_c, _p, _e, scope) =>
          ({ scope: scope ?? 'shared' }) as unknown as ReturnType<
            typeof createAzureClient
          >,
      );
      rs.mocked(listSecrets).mockImplementation(
        async (client): Promise<Record<string, string>> =>
          (client as unknown as { scope: string }).scope === 'shared'
            ? { 'test-project-shared-KONG-TRUST-TOKEN': 'v' }
            : { 'test-project-auth-service-ADMIN-EMAILS': 'v' },
      );

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
        ['auth-service', 'offers-service'],
      );

      expect(result).toEqual([
        { key: 'KONG_TRUST_TOKEN', scope: 'shared' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service' },
      ]);
      // offers-service has no vault yet: not read
      expect(createAzureClient).toHaveBeenCalledTimes(2);
      expect(createAzureClient).not.toHaveBeenCalledWith(
        mockCredentials,
        mockProjectName,
        mockEnv,
        'offers-service',
      );
    });
  });

  describe('Standard use cases', () => {
    it('should list shared secrets with keys converted to underscores', async () => {
      mockSecrets({
        'test-project-shared-DATABASE-URL': 'value1',
        'test-project-shared-API-KEY': 'value2',
        'test-project-shared-JWT-PRIVATE-KEY-CURRENT': 'value3',
      });

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([
        { key: 'DATABASE_URL', scope: 'shared' },
        { key: 'API_KEY', scope: 'shared' },
        { key: 'JWT_PRIVATE_KEY_CURRENT', scope: 'shared' },
      ]);
      expect(loadAzureCredentials).toHaveBeenCalledWith(
        mockProjectRoot,
        mockEnv,
      );
      expect(createAzureClient).toHaveBeenCalledWith(
        mockCredentials,
        mockProjectName,
        mockEnv,
        undefined,
      );
      expect(listSecrets).toHaveBeenCalledWith(mockClient, mockProjectName);
    });

    it('should include service-scoped secrets with their scope', async () => {
      mockSecrets({
        'test-project-shared-JWT-SECRET': 'value1',
        'test-project-auth-service-ADMIN-EMAILS': 'value2',
        'test-project-auth-service-DATABASE-URL': 'value3',
        'test-project-offers-service-DATABASE-URL': 'value4',
      });

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([
        { key: 'JWT_SECRET', scope: 'shared' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service' },
        { key: 'DATABASE_URL', scope: 'auth-service' },
        { key: 'DATABASE_URL', scope: 'offers-service' },
      ]);
    });

    it('should filter out secrets that cannot be parsed', async () => {
      mockSecrets({
        'test-project-shared-VALID-KEY': 'value1',
        'malformed-secret-name': 'value2',
        'test-project-shared-lowercase-key': 'value3',
        'test-project-auth-service-ANOTHER-KEY': 'value4',
      });

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
      mockSecrets({});

      const result = await listSecretsWithKeys(
        mockProjectRoot,
        mockEnv,
        mockProjectName,
      );

      expect(result).toEqual([]);
    });

    it('should handle all unparseable secret names', async () => {
      mockSecrets({
        'bad-name-1': 'value1',
        'bad-name-2': 'value2',
      });

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
      rs.mocked(loadAzureCredentials).mockImplementation(() => {
        throw new Error('Credentials not found');
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from Azure');
    });

    it('should throw CliError when client creation fails', async () => {
      rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAzureClient).mockImplementation(() => {
        throw new Error('Client creation failed');
      });

      await expect(
        listSecretsWithKeys(mockProjectRoot, mockEnv, mockProjectName),
      ).rejects.toThrow('Failed to list secrets from Azure');
    });

    it('should throw CliError when listing secrets fails', async () => {
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
