import { describe, it, expect, rs } from '@rstest/core';
import { getSecret } from './get-secret';
import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';

describe('getSecret', () => {
  describe('successful retrieval', () => {
    it('should return secret value when secret exists', async () => {
      const mockClient = {
        accessSecretVersion: rs.fn().mockResolvedValue([
          {
            payload: {
              data: Buffer.from('my-secret-value'),
            },
          },
        ]),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(
        mockClient,
        'projects/test-project/secrets/my-secret',
      );

      expect(result).toBe('my-secret-value');
      expect(mockClient.accessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/my-secret/versions/latest',
      });
    });

    it('should handle string data payload', async () => {
      const mockClient = {
        accessSecretVersion: rs.fn().mockResolvedValue([
          {
            payload: {
              data: 'string-secret-value',
            },
          },
        ]),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(mockClient, 'projects/proj/secrets/test');

      expect(result).toBe('string-secret-value');
    });
  });

  describe('secret not found', () => {
    it('should return null when secret does not exist (code 5)', async () => {
      const error = new Error('NOT_FOUND') as Error & { code: number };
      error.code = 5;
      const mockClient = {
        accessSecretVersion: rs.fn().mockRejectedValue(error),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(
        mockClient,
        'projects/test/secrets/missing',
      );

      expect(result).toBeNull();
    });

    it('should return null when secret does not exist (code 404)', async () => {
      const error = new Error('NOT_FOUND') as Error & { code: number };
      error.code = 404;
      const mockClient = {
        accessSecretVersion: rs.fn().mockRejectedValue(error),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(
        mockClient,
        'projects/test/secrets/missing',
      );

      expect(result).toBeNull();
    });
  });

  describe('null payload handling', () => {
    it('should return null when payload is missing', async () => {
      const mockClient = {
        accessSecretVersion: rs.fn().mockResolvedValue([{}]),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(mockClient, 'projects/test/secrets/empty');

      expect(result).toBeNull();
    });

    it('should return null when payload data is missing', async () => {
      const mockClient = {
        accessSecretVersion: rs.fn().mockResolvedValue([{ payload: {} }]),
      } as unknown as SecretManagerServiceClient;

      const result = await getSecret(mockClient, 'projects/test/secrets/empty');

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw error for non-not-found errors', async () => {
      const error = new Error('Permission denied') as Error & { code: number };
      error.code = 7;
      const mockClient = {
        accessSecretVersion: rs.fn().mockRejectedValue(error),
      } as unknown as SecretManagerServiceClient;

      await expect(
        getSecret(mockClient, 'projects/test/secrets/forbidden'),
      ).rejects.toThrow('Permission denied');
    });

    it('should throw error when error has no code', async () => {
      const error = new Error('Unknown error');
      const mockClient = {
        accessSecretVersion: rs.fn().mockRejectedValue(error),
      } as unknown as SecretManagerServiceClient;

      await expect(
        getSecret(mockClient, 'projects/test/secrets/error'),
      ).rejects.toThrow('Unknown error');
    });
  });
});
