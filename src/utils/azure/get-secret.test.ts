import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { SecretClient } from '@azure/keyvault-secrets';
import { getSecret } from './get-secret';

describe('getSecret', () => {
  let mockClient: SecretClient;
  let mockGetSecret: ReturnType<typeof rs.fn>;

  beforeEach(() => {
    rs.clearAllMocks();
    mockGetSecret = rs.fn();
    mockClient = {
      getSecret: mockGetSecret,
    } as unknown as SecretClient;
  });

  describe('Standard use cases', () => {
    it('should retrieve a secret value successfully', async () => {
      const mockSecretValue = 'super-secret-value';
      mockGetSecret.mockResolvedValueOnce({
        value: mockSecretValue,
        name: 'test-secret',
      });

      const result = await getSecret(mockClient, 'test-secret');

      expect(result).toBe(mockSecretValue);
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
      expect(mockGetSecret).toHaveBeenCalledWith('test-secret');
    });

    it('should handle secrets with complex names', async () => {
      const secretName = 'my-project-shared-DATABASE-URL';
      mockGetSecret.mockResolvedValueOnce({
        value: 'postgresql://localhost:5432/db',
        name: secretName,
      });

      const result = await getSecret(mockClient, secretName);

      expect(result).toBe('postgresql://localhost:5432/db');
      expect(mockGetSecret).toHaveBeenCalledWith(secretName);
    });
  });

  describe('Edge cases', () => {
    it('should return null when secret value is undefined', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: undefined,
        name: 'test-secret',
      });

      const result = await getSecret(mockClient, 'test-secret');

      expect(result).toBe(null);
    });

    it('should return null when secret value is null', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: null,
        name: 'test-secret',
      });

      const result = await getSecret(mockClient, 'test-secret');

      expect(result).toBe(null);
    });

    it('should return null when secret value is empty string', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: '',
        name: 'test-secret',
      });

      const result = await getSecret(mockClient, 'test-secret');

      // Empty string is falsy, so it returns null
      expect(result).toBe(null);
    });
  });

  describe('Error handling', () => {
    it('should return null for 404 errors', async () => {
      const notFoundError = { statusCode: 404, message: 'Secret not found' };
      mockGetSecret.mockRejectedValueOnce(notFoundError);

      const result = await getSecret(mockClient, 'non-existent');

      expect(result).toBe(null);
    });

    it('should throw non-404 errors', async () => {
      const error = new Error('Access denied');
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(
        getSecret(mockClient, 'unauthorized-secret'),
      ).rejects.toThrow('Access denied');
    });

    it('should throw errors without statusCode', async () => {
      const error = new Error('Network error');
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(
        getSecret(mockClient, 'network-error-secret'),
      ).rejects.toThrow('Network error');
    });

    it('should handle errors with statusCode other than 404', async () => {
      const error = { statusCode: 403, message: 'Forbidden' };
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(getSecret(mockClient, 'forbidden-secret')).rejects.toEqual(
        error,
      );
    });
  });
});
