import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import {
  ListSecretsCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { listSecrets } from './list-secrets';

rs.mock('@aws-sdk/client-secrets-manager', { mock: true });

describe('listSecrets', () => {
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
    it('should list secrets for a project', async () => {
      const mockSecrets = [
        { Name: 'test-project-shared-API_KEY' },
        { Name: 'test-project-shared-DB_PASSWORD' },
        { Name: 'test-project-shared-JWT_SECRET' },
      ];

      mockSend.mockResolvedValueOnce({
        SecretList: mockSecrets,
        NextToken: undefined,
      });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual([
        'test-project-shared-API_KEY',
        'test-project-shared-DB_PASSWORD',
        'test-project-shared-JWT_SECRET',
      ]);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(ListSecretsCommand));
    });

    it('should handle pagination', async () => {
      const firstBatch = [
        { Name: 'my-app-shared-KEY1' },
        { Name: 'my-app-shared-KEY2' },
      ];
      const secondBatch = [
        { Name: 'my-app-shared-KEY3' },
        { Name: 'my-app-shared-KEY4' },
      ];

      mockSend
        .mockResolvedValueOnce({
          SecretList: firstBatch,
          NextToken: 'token123',
        })
        .mockResolvedValueOnce({
          SecretList: secondBatch,
          NextToken: undefined,
        });

      const result = await listSecrets(mockClient, 'my-app');

      expect(result).toEqual([
        'my-app-shared-KEY1',
        'my-app-shared-KEY2',
        'my-app-shared-KEY3',
        'my-app-shared-KEY4',
      ]);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should use tag filters for project name', async () => {
      const mockSecrets = [
        { Name: 'test-project-shared-API_KEY' },
        { Name: 'test-project-shared-DB_PASSWORD' },
      ];

      mockSend.mockResolvedValueOnce({
        SecretList: mockSecrets,
        NextToken: undefined,
      });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual([
        'test-project-shared-API_KEY',
        'test-project-shared-DB_PASSWORD',
      ]);

      // Verify ListSecretsCommand was used
      expect(mockSend).toHaveBeenCalledWith(expect.any(ListSecretsCommand));
    });
  });

  describe('Edge cases', () => {
    it('should return empty array when no secrets exist', async () => {
      mockSend.mockResolvedValueOnce({
        SecretList: [],
        NextToken: undefined,
      });

      const result = await listSecrets(mockClient, 'empty-project');

      expect(result).toEqual([]);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined SecretList', async () => {
      mockSend.mockResolvedValueOnce({
        SecretList: undefined,
        NextToken: undefined,
      });

      const result = await listSecrets(mockClient, 'no-list-project');

      expect(result).toEqual([]);
    });

    it('should skip secrets without Name property', async () => {
      const mockSecrets = [
        { Name: 'test-project-shared-KEY1' },
        { ARN: 'arn:aws:secretsmanager:...' }, // No Name
        { Name: undefined }, // Name is undefined
        { Name: 'test-project-shared-KEY2' },
      ];

      mockSend.mockResolvedValueOnce({
        SecretList: mockSecrets,
        NextToken: undefined,
      });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual([
        'test-project-shared-KEY1',
        'test-project-shared-KEY2',
      ]);
    });
  });

  describe('Error handling', () => {
    it('should throw error when AWS API call fails', async () => {
      const mockError = new Error('AWS API Error');
      mockSend.mockRejectedValueOnce(mockError);

      await expect(listSecrets(mockClient, 'error-project')).rejects.toThrow(
        'AWS API Error',
      );
    });

    it('should propagate errors from AWS SDK', async () => {
      const mockError = new Error('Access denied');
      mockSend.mockRejectedValueOnce(mockError);

      await expect(
        listSecrets(mockClient, 'unauthorized-project'),
      ).rejects.toThrow('Access denied');
    });
  });
});
