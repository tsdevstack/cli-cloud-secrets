import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { getSecret } from './get-secret';

rs.mock('@aws-sdk/client-secrets-manager', { mock: true });

describe('getSecret', () => {
  let mockClient: SecretsManagerClient;
  let mockSend: ReturnType<typeof rs.fn>;

  beforeEach(() => {
    rs.clearAllMocks();
    mockSend = rs.fn();
    mockClient = {
      send: mockSend,
    } as unknown as SecretsManagerClient;
  });

  describe('Standard use cases', () => {
    it('should retrieve a secret value successfully', async () => {
      const mockSecretValue = 'super-secret-value';
      mockSend.mockResolvedValueOnce({
        SecretString: mockSecretValue,
      });

      const result = await getSecret(mockClient, 'test-secret-name');

      expect(result).toBe(mockSecretValue);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
    });

    it('should return null when SecretString is not present', async () => {
      mockSend.mockResolvedValueOnce({
        SecretBinary: Buffer.from('binary-secret'),
      });

      const result = await getSecret(mockClient, 'binary-secret-name');

      // The function only returns SecretString, not SecretBinary
      expect(result).toBe(null);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('should return null when no secret value is found', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await getSecret(mockClient, 'empty-secret');

      expect(result).toBe(null);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return null when SecretString is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: undefined,
        SecretBinary: undefined,
      });

      const result = await getSecret(mockClient, 'undefined-secret');

      expect(result).toBe(null);
    });
  });

  describe('Error handling', () => {
    it('should return null when AWS API call fails', async () => {
      const mockError = new Error('AWS API Error');
      mockSend.mockRejectedValueOnce(mockError);

      const result = await getSecret(mockClient, 'failing-secret');

      expect(result).toBe(null);
    });

    it('should return null on access denied', async () => {
      const mockError = new Error('Access denied');
      mockSend.mockRejectedValueOnce(mockError);

      const result = await getSecret(mockClient, 'unauthorized-secret');

      expect(result).toBe(null);
    });
  });
});
