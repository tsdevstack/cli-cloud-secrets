import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { SecretClient } from '@azure/keyvault-secrets';
import { secretExists } from './secret-exists';

describe('secretExists', () => {
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
    it('should return true when secret exists', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: 'secret-value',
        name: 'existing-secret',
      });

      const result = await secretExists(mockClient, 'existing-secret');

      expect(result).toBe(true);
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
      expect(mockGetSecret).toHaveBeenCalledWith('existing-secret');
    });

    it('should return false when secret does not exist (404)', async () => {
      const notFoundError = { statusCode: 404, message: 'Secret not found' };
      mockGetSecret.mockRejectedValueOnce(notFoundError);

      const result = await secretExists(mockClient, 'non-existent');

      expect(result).toBe(false);
      expect(mockGetSecret).toHaveBeenCalledWith('non-existent');
    });

    it('should work with secrets that have empty values', async () => {
      mockGetSecret.mockResolvedValueOnce({
        value: '',
        name: 'empty-secret',
      });

      const result = await secretExists(mockClient, 'empty-secret');

      expect(result).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw non-404 errors', async () => {
      const error = new Error('Access denied');
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(
        secretExists(mockClient, 'unauthorized-secret'),
      ).rejects.toThrow('Access denied');
    });

    it('should throw errors with different status codes', async () => {
      const error = { statusCode: 403, message: 'Forbidden' };
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(
        secretExists(mockClient, 'forbidden-secret'),
      ).rejects.toEqual(error);
    });

    it('should throw errors without statusCode property', async () => {
      const error = new Error('Network error');
      mockGetSecret.mockRejectedValueOnce(error);

      await expect(
        secretExists(mockClient, 'network-error-secret'),
      ).rejects.toThrow('Network error');
    });

    it('should handle non-object errors', async () => {
      mockGetSecret.mockRejectedValueOnce('String error');

      await expect(
        secretExists(mockClient, 'string-error-secret'),
      ).rejects.toBe('String error');
    });

    it('should handle null errors', async () => {
      mockGetSecret.mockRejectedValueOnce(null);

      await expect(secretExists(mockClient, 'null-error-secret')).rejects.toBe(
        null,
      );
    });
  });
});
