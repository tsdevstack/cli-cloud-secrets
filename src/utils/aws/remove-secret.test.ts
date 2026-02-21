import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import {
  DeleteSecretCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { removeSecret } from './remove-secret';

rs.mock('@aws-sdk/client-secrets-manager', { mock: true });

describe('removeSecret', () => {
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
    it('should remove a secret successfully', async () => {
      mockSend.mockResolvedValueOnce({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789:secret:test-secret',
        Name: 'test-secret',
        DeletionDate: new Date('2024-01-01'),
      });

      await removeSecret(mockClient, 'test-secret');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteSecretCommand));
    });

    it('should handle force deletion', async () => {
      mockSend.mockResolvedValueOnce({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789:secret:test-secret',
        Name: 'test-secret',
        DeletionDate: new Date('2024-01-01'),
      });

      await removeSecret(mockClient, 'test-secret');

      // Verify the command was sent
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteSecretCommand);
    });

    it('should remove secrets with complex names', async () => {
      const complexSecretName = 'my-project-shared-API_KEY_V2';
      mockSend.mockResolvedValueOnce({
        ARN: `arn:aws:secretsmanager:us-east-1:123456789:secret:${complexSecretName}`,
        Name: complexSecretName,
        DeletionDate: new Date('2024-01-01'),
      });

      await removeSecret(mockClient, complexSecretName);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle removing non-existent secret', async () => {
      // AWS doesn't throw error for non-existent secrets during delete
      mockSend.mockResolvedValueOnce({
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789:secret:non-existent',
        Name: 'non-existent',
      });

      await removeSecret(mockClient, 'non-existent');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle empty response from AWS', async () => {
      mockSend.mockResolvedValueOnce({});

      await removeSecret(mockClient, 'empty-response-secret');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should throw error when AWS API call fails', async () => {
      const mockError = new Error('AWS API Error');
      mockSend.mockRejectedValueOnce(mockError);

      await expect(removeSecret(mockClient, 'failing-secret')).rejects.toThrow(
        'AWS API Error',
      );
    });

    it('should propagate access denied errors', async () => {
      const mockError = new Error('Access denied');
      mockSend.mockRejectedValueOnce(mockError);

      await expect(
        removeSecret(mockClient, 'unauthorized-secret'),
      ).rejects.toThrow('Access denied');
    });

    it('should handle non-Error objects', async () => {
      mockSend.mockRejectedValueOnce('String error');

      await expect(
        removeSecret(mockClient, 'string-error-secret'),
      ).rejects.toThrow('String error');
    });
  });
});
