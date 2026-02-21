import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import { removeSecretByName } from './remove-secret-by-name';

// Mock dependencies
rs.mock('./load-aws-credentials', { mock: true });
rs.mock('./client-factory', { mock: true });
rs.mock('./remove-secret', { mock: true });

import { loadAWSCredentials } from './load-aws-credentials';
import { createAWSClient } from './client-factory';
import { removeSecret } from './remove-secret';

describe('removeSecretByName', () => {
  const mockProjectRoot = '/test/project';
  const mockEnv = 'development';
  const mockSecretName = 'test-project-shared-API_KEY';

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should remove a secret by name successfully', async () => {
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
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({ success: true });
      expect(loadAWSCredentials).toHaveBeenCalledWith(mockProjectRoot, mockEnv);
      expect(createAWSClient).toHaveBeenCalledWith(mockCredentials);
      expect(removeSecret).toHaveBeenCalledWith(mockClient, mockSecretName);
    });

    it('should handle different secret names', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };
      const mockClient = { send: rs.fn() };
      const secretNames = [
        'test-project-shared-DB_PASSWORD',
        'test-project-shared-JWT_SECRET',
        'my-app-shared-OAUTH_CLIENT_ID',
      ];

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      for (const secretName of secretNames) {
        const result = await removeSecretByName(
          mockProjectRoot,
          mockEnv,
          secretName,
        );

        expect(result).toEqual({ success: true });
        expect(removeSecret).toHaveBeenCalledWith(mockClient, secretName);
      }
    });
  });

  describe('Integration flow', () => {
    it('should handle the complete flow from credentials to deletion', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-west-2',
      };
      const mockClient = { send: rs.fn() };

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createAWSClient>,
      );
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      const result = await removeSecretByName(
        mockProjectRoot,
        'production',
        'my-app-shared-DATABASE_URL',
      );

      expect(result).toEqual({ success: true });

      // Verify the flow order
      const loadCredentialsOrder =
        rs.mocked(loadAWSCredentials).mock.invocationCallOrder[0];
      const createClientOrder =
        rs.mocked(createAWSClient).mock.invocationCallOrder[0];
      const removeSecretOrder =
        rs.mocked(removeSecret).mock.invocationCallOrder[0];

      expect(loadCredentialsOrder).toBeLessThan(createClientOrder);
      expect(createClientOrder).toBeLessThan(removeSecretOrder);
    });
  });

  describe('Error handling', () => {
    it('should return error when credentials loading fails', async () => {
      rs.mocked(loadAWSCredentials).mockImplementation(() => {
        throw new Error('Credentials not found');
      });

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({
        success: false,
        error: 'Credentials not found',
      });
    });

    it('should return error when client creation fails', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockImplementation(() => {
        throw new Error('Invalid region');
      });

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({
        success: false,
        error: 'Invalid region',
      });
    });

    it('should return error when removing secret fails', async () => {
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
      rs.mocked(removeSecret).mockRejectedValue(new Error('Access denied'));

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({
        success: false,
        error: 'Access denied',
      });
    });

    it('should handle non-Error objects in catch', async () => {
      const mockCredentials = {
        accountId: '123456789012',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        region: 'us-east-1',
      };

      rs.mocked(loadAWSCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createAWSClient).mockImplementation(() => {
        throw 'String error'; // Non-Error object
      });

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({
        success: false,
        error: 'String error',
      });
    });
  });
});
