import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import { removeSecretByName } from './remove-secret-by-name';

// Mock dependencies
rs.mock('./load-gcp-credentials', { mock: true });
rs.mock('./client-factory', { mock: true });
rs.mock('./remove-secret', { mock: true });

import { loadGCPCredentials } from './load-gcp-credentials';
import { createGCPClient } from './client-factory';
import { removeSecret } from './remove-secret';

describe('removeSecretByName', () => {
  const mockProjectRoot = '/test/project';
  const mockEnv = 'development';
  const mockSecretName = 'test-project-shared-API_KEY';
  const mockProjectId = 'test-gcp-project';

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should remove a secret by name successfully', async () => {
      const mockCredentials = {
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };
      const mockClient = { deleteSecret: rs.fn() };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({ success: true });
      expect(loadGCPCredentials).toHaveBeenCalledWith(mockProjectRoot, mockEnv);
      expect(createGCPClient).toHaveBeenCalledWith(mockCredentials);
      expect(removeSecret).toHaveBeenCalledWith(
        mockClient,
        mockProjectId,
        mockSecretName,
      );
    });

    it('should handle different secret names', async () => {
      const mockCredentials = {
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };
      const mockClient = { deleteSecret: rs.fn() };
      const secretNames = [
        'test-project-shared-DB_PASSWORD',
        'test-project-shared-JWT_SECRET',
        'my-app-shared-OAUTH_CLIENT_ID',
      ];

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      for (const secretName of secretNames) {
        const result = await removeSecretByName(
          mockProjectRoot,
          mockEnv,
          secretName,
        );

        expect(result).toEqual({ success: true });
        expect(removeSecret).toHaveBeenCalledWith(
          mockClient,
          mockProjectId,
          secretName,
        );
      }
    });
  });

  describe('Integration flow', () => {
    it('should handle the complete flow from credentials to deletion', async () => {
      const mockCredentials = {
        project_id: 'production-gcp-project',
        client_email: 'prod@project.iam.gserviceaccount.com',
        private_key: 'prod-key',
        region: 'europe-west1',
      };
      const mockClient = { deleteSecret: rs.fn() };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(removeSecret).mockResolvedValue(undefined);

      const result = await removeSecretByName(
        mockProjectRoot,
        'production',
        'my-app-shared-DATABASE_URL',
      );

      expect(result).toEqual({ success: true });

      const loadCredentialsOrder =
        rs.mocked(loadGCPCredentials).mock.invocationCallOrder[0];
      const createClientOrder =
        rs.mocked(createGCPClient).mock.invocationCallOrder[0];
      const removeSecretOrder =
        rs.mocked(removeSecret).mock.invocationCallOrder[0];

      expect(loadCredentialsOrder).toBeLessThan(createClientOrder);
      expect(createClientOrder).toBeLessThan(removeSecretOrder);
    });
  });

  describe('Error handling', () => {
    it('should return error when credentials loading fails', async () => {
      rs.mocked(loadGCPCredentials).mockImplementation(() => {
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
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockImplementation(() => {
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
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };
      const mockClient = { deleteSecret: rs.fn() };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(removeSecret).mockRejectedValue(new Error('Permission denied'));

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result).toEqual({
        success: false,
        error: 'Permission denied',
      });
    });

    it('should propagate NOT_FOUND error when secret does not exist', async () => {
      const mockCredentials = {
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };
      const mockClient = { deleteSecret: rs.fn() };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockReturnValue(
        mockClient as unknown as ReturnType<typeof createGCPClient>,
      );
      rs.mocked(removeSecret).mockRejectedValue(
        new Error('5 NOT_FOUND: Secret not found'),
      );

      const result = await removeSecretByName(
        mockProjectRoot,
        mockEnv,
        mockSecretName,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('NOT_FOUND');
    });

    it('should handle non-Error objects in catch', async () => {
      const mockCredentials = {
        project_id: mockProjectId,
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
        region: 'us-central1',
      };

      rs.mocked(loadGCPCredentials).mockReturnValue(mockCredentials);
      rs.mocked(createGCPClient).mockImplementation(() => {
        throw 'String error';
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
