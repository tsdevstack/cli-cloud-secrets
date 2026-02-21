import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from '../../test-utils/mock-context';
import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () => (globalThis as unknown as { contextMocks: MockContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

import { listSecretsWithKeys } from './list-secrets-with-keys';

describe('listSecretsWithKeys', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('successful listing', () => {
    it('should return extracted secrets from GCP', async () => {
      const mockClient = {
        listSecrets: rs
          .fn()
          .mockResolvedValue([
            [
              {
                name: 'projects/test-project/secrets/myapp-shared-DATABASE_URL',
              },
              { name: 'projects/test-project/secrets/myapp-shared-API_KEY' },
            ],
          ]),
      } as unknown as SecretManagerServiceClient;

      const result = await listSecretsWithKeys(
        mockClient,
        'test-project',
        'myapp',
      );

      expect(result).toEqual([
        { key: 'DATABASE_URL', scope: 'shared' },
        { key: 'API_KEY', scope: 'shared' },
      ]);
      expect(mockClient.listSecrets).toHaveBeenCalledWith({
        parent: 'projects/test-project',
        filter: 'labels.project-name=myapp',
      });
    });

    it('should handle service-scoped secrets', async () => {
      const mockClient = {
        listSecrets: rs
          .fn()
          .mockResolvedValue([
            [
              { name: 'projects/proj/secrets/myapp-auth-service-JWT_SECRET' },
              { name: 'projects/proj/secrets/myapp-shared-REDIS_URL' },
            ],
          ]),
      } as unknown as SecretManagerServiceClient;

      const result = await listSecretsWithKeys(mockClient, 'proj', 'myapp');

      expect(result).toEqual([
        { key: 'JWT_SECRET', scope: 'auth-service' },
        { key: 'REDIS_URL', scope: 'shared' },
      ]);
    });

    it('should return empty array when no secrets exist', async () => {
      const mockClient = {
        listSecrets: rs.fn().mockResolvedValue([[]]),
      } as unknown as SecretManagerServiceClient;

      const result = await listSecretsWithKeys(
        mockClient,
        'test-project',
        'myapp',
      );

      expect(result).toEqual([]);
    });

    it('should skip secrets with missing name', async () => {
      const mockClient = {
        listSecrets: rs
          .fn()
          .mockResolvedValue([
            [
              { name: 'projects/proj/secrets/myapp-shared-KEY1' },
              { name: null },
              { name: undefined },
              { name: 'projects/proj/secrets/myapp-shared-KEY2' },
            ],
          ]),
      } as unknown as SecretManagerServiceClient;

      const result = await listSecretsWithKeys(mockClient, 'proj', 'myapp');

      expect(result).toEqual([
        { key: 'KEY1', scope: 'shared' },
        { key: 'KEY2', scope: 'shared' },
      ]);
    });

    it('should skip secrets that do not match project name pattern', async () => {
      const mockClient = {
        listSecrets: rs
          .fn()
          .mockResolvedValue([
            [
              { name: 'projects/proj/secrets/myapp-shared-VALID_KEY' },
              { name: 'projects/proj/secrets/other-shared-WRONG_PROJECT' },
              { name: 'projects/proj/secrets/invalid-format' },
            ],
          ]),
      } as unknown as SecretManagerServiceClient;

      const result = await listSecretsWithKeys(mockClient, 'proj', 'myapp');

      expect(result).toEqual([{ key: 'VALID_KEY', scope: 'shared' }]);
    });
  });

  describe('error handling', () => {
    it('should throw CliError when listing fails', async () => {
      const mockClient = {
        listSecrets: rs.fn().mockRejectedValue(new Error('Permission denied')),
      } as unknown as SecretManagerServiceClient;

      await expect(
        listSecretsWithKeys(mockClient, 'test-project', 'myapp'),
      ).rejects.toThrow(mocks.CliError);

      await expect(
        listSecretsWithKeys(mockClient, 'test-project', 'myapp'),
      ).rejects.toThrow('Failed to list secrets from GCP: Permission denied');
    });

    it('should include helpful hint in error', async () => {
      const mockClient = {
        listSecrets: rs.fn().mockRejectedValue(new Error('API error')),
      } as unknown as SecretManagerServiceClient;

      try {
        await listSecretsWithKeys(mockClient, 'proj', 'myapp');
      } catch (error) {
        expect(error).toBeInstanceOf(mocks.CliError);
        expect((error as InstanceType<typeof mocks.CliError>).hint).toBe(
          'Check that your GCP credentials have the necessary permissions to list secrets',
        );
      }
    });

    it('should handle non-Error thrown values', async () => {
      const mockClient = {
        listSecrets: rs.fn().mockRejectedValue('string error'),
      } as unknown as SecretManagerServiceClient;

      await expect(
        listSecretsWithKeys(mockClient, 'proj', 'myapp'),
      ).rejects.toThrow('Failed to list secrets from GCP: string error');
    });
  });
});
