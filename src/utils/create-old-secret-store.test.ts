import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../context', () => ({
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
}));
rs.mock('./create-secret-store-reader', { mock: true });
rs.mock('./gcp/remove-secret-by-name', { mock: true });
rs.mock('./aws/remove-secret-by-name', { mock: true });
rs.mock('./azure/load-azure-credentials', { mock: true });
rs.mock('./azure/create-azure-client', { mock: true });
rs.mock('./azure/get-secret', { mock: true });
rs.mock('./azure/remove-secret-by-name', { mock: true });

import { createOldSecretStore } from './create-old-secret-store';
import { createSecretStoreReader } from './create-secret-store-reader';
import { removeSecretByName as removeGCPSecretByName } from './gcp/remove-secret-by-name';
import { removeSecretByName as removeAWSSecretByName } from './aws/remove-secret-by-name';
import { loadAzureCredentials } from './azure/load-azure-credentials';
import { createAzureClient } from './azure/create-azure-client';
import { getSecret as getAzureSecret } from './azure/get-secret';
import { removeSecretByName as removeAzureSecretByName } from './azure/remove-secret-by-name';

describe('createOldSecretStore', () => {
  const target = (provider: 'gcp' | 'aws' | 'azure') => ({
    provider,
    projectRoot: '/project',
    projectName: 'shop',
    env: 'dev',
  });
  const reader = { exists: rs.fn(), read: rs.fn() };

  beforeEach(() => {
    rs.clearAllMocks();
    mocks.buildSecretName.mockImplementation(
      (project: string, scope: string, key: string) =>
        `${project}-${scope}-${key}`,
    );
    rs.mocked(createSecretStoreReader).mockReturnValue(reader);
  });

  describe('GCP and AWS', () => {
    it("should read the old copy from the environment's store", async () => {
      reader.read.mockResolvedValue('key-1');

      const value = await createOldSecretStore(target('gcp')).read(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );

      expect(value).toBe('key-1');
      expect(reader.read).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );
    });

    it('should delete the old copy by its name on GCP', async () => {
      rs.mocked(removeGCPSecretByName).mockResolvedValue({ success: true });

      await createOldSecretStore(target('gcp')).remove(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );

      expect(removeGCPSecretByName).toHaveBeenCalledWith(
        '/project',
        'dev',
        'shop-shared-JWT_PRIVATE_KEY_CURRENT',
      );
    });

    it('should delete the old copy by its name on AWS', async () => {
      rs.mocked(removeAWSSecretByName).mockResolvedValue({ success: true });

      await createOldSecretStore(target('aws')).remove(
        'ADMIN_EMAILS',
        'shared',
      );

      expect(removeAWSSecretByName).toHaveBeenCalledWith(
        '/project',
        'dev',
        'shop-shared-ADMIN_EMAILS',
      );
      expect(removeGCPSecretByName).not.toHaveBeenCalled();
    });
  });

  describe('Azure', () => {
    const credentials = {
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
      subscriptionId: 'sub',
      location: 'eastus',
    };
    const sharedVault = { vault: 'shared' };

    beforeEach(() => {
      rs.mocked(loadAzureCredentials).mockReturnValue(credentials);
      rs.mocked(createAzureClient).mockReturnValue(
        sharedVault as unknown as ReturnType<typeof createAzureClient>,
      );
    });

    it("should read a service's old copy from the shared vault", async () => {
      rs.mocked(getAzureSecret).mockResolvedValue('a@example.com');

      const value = await createOldSecretStore(target('azure')).read(
        'ADMIN_EMAILS',
        'auth-service',
      );

      expect(value).toBe('a@example.com');
      // No scope: the shared vault
      expect(createAzureClient).toHaveBeenCalledWith(
        credentials,
        'shop',
        'dev',
      );
      expect(getAzureSecret).toHaveBeenCalledWith(
        sharedVault,
        'shop-auth-service-ADMIN-EMAILS',
      );
    });

    it('should delete the old copy from the shared vault', async () => {
      rs.mocked(removeAzureSecretByName).mockResolvedValue({ success: true });

      await createOldSecretStore(target('azure')).remove(
        'ADMIN_EMAILS',
        'auth-service',
      );

      expect(removeAzureSecretByName).toHaveBeenCalledWith(
        '/project',
        'dev',
        'shop',
        'shop-auth-service-ADMIN_EMAILS',
      );
    });
  });

  describe('Error handling', () => {
    it('should throw when the delete fails', async () => {
      rs.mocked(removeGCPSecretByName).mockResolvedValue({
        success: false,
        error: 'Permission denied',
      });

      await expect(
        createOldSecretStore(target('gcp')).remove('ADMIN_EMAILS', 'shared'),
      ).rejects.toThrow(
        'Failed to delete shop-shared-ADMIN_EMAILS: Permission denied',
      );
    });
  });
});
