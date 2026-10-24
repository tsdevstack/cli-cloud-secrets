import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

// Mock context using the shared mocks
rs.mock('../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

rs.mock('./gcp/load-gcp-credentials', () => ({
  loadGCPCredentials: rs.fn(() => ({ project_id: 'gcp-prod' })),
}));
rs.mock('./gcp/client-factory', () => ({
  createGCPClient: rs.fn(() => ({ name: 'gcp-client' })),
}));
rs.mock('./gcp/secret-exists', () => ({ secretExists: rs.fn() }));
rs.mock('./gcp/get-secret', () => ({ getSecret: rs.fn() }));
rs.mock('./aws/load-aws-credentials', () => ({
  loadAWSCredentials: rs.fn(() => ({ region: 'us-east-1' })),
}));
rs.mock('./aws/client-factory', () => ({
  createAWSClient: rs.fn(() => ({ name: 'aws-client' })),
}));
rs.mock('./aws/secret-exists', () => ({ secretExists: rs.fn() }));
rs.mock('./aws/get-secret', () => ({ getSecret: rs.fn() }));
rs.mock('./azure/load-azure-credentials', () => ({
  loadAzureCredentials: rs.fn(() => ({ subscriptionId: 'sub' })),
}));
rs.mock('./azure/create-azure-client', () => ({
  createAzureClient: rs.fn(() => ({ name: 'azure-client' })),
}));
rs.mock('./azure/secret-exists', () => ({ secretExists: rs.fn() }));
rs.mock('./azure/get-secret', () => ({ getSecret: rs.fn() }));

import { createSecretStoreReader } from './create-secret-store-reader';
import { loadGCPCredentials } from './gcp/load-gcp-credentials';
import { secretExists as secretExistsGCP } from './gcp/secret-exists';
import { getSecret as getSecretGCP } from './gcp/get-secret';
import { secretExists as secretExistsAWS } from './aws/secret-exists';
import { getSecret as getSecretAWS } from './aws/get-secret';
import { createAzureClient } from './azure/create-azure-client';
import { secretExists as secretExistsAzure } from './azure/secret-exists';
import { getSecret as getSecretAzure } from './azure/get-secret';

describe('createSecretStoreReader', () => {
  const base = {
    projectRoot: '/root',
    projectName: 'shop',
    env: 'prod',
  };

  beforeEach(() => {
    rs.clearAllMocks();
    mocks.buildSecretName.mockImplementation(
      (project: string, scope: string, key: string) =>
        `${project}-${scope}-${key}`,
    );
  });

  describe('GCP', () => {
    it('should check existence by the shared secret name in the env project', async () => {
      rs.mocked(secretExistsGCP).mockResolvedValue(true);

      const reader = createSecretStoreReader({ ...base, provider: 'gcp' });

      await expect(reader.exists('DOMAIN')).resolves.toBe(true);
      expect(loadGCPCredentials).toHaveBeenCalledWith('/root', 'prod');
      expect(secretExistsGCP).toHaveBeenCalledWith(
        { name: 'gcp-client' },
        'gcp-prod',
        'shop-shared-DOMAIN',
      );
    });

    it('should read by the full resource name', async () => {
      rs.mocked(getSecretGCP).mockResolvedValue('example.com');

      const reader = createSecretStoreReader({ ...base, provider: 'gcp' });

      await expect(reader.read('DOMAIN')).resolves.toBe('example.com');
      expect(getSecretGCP).toHaveBeenCalledWith(
        { name: 'gcp-client' },
        'projects/gcp-prod/secrets/shop-shared-DOMAIN',
      );
    });
  });

  describe('AWS', () => {
    it('should use the secret name as is', async () => {
      rs.mocked(secretExistsAWS).mockResolvedValue(false);
      rs.mocked(getSecretAWS).mockResolvedValue(null);

      const reader = createSecretStoreReader({ ...base, provider: 'aws' });

      await expect(reader.exists('RESEND_API_KEY')).resolves.toBe(false);
      await expect(reader.read('RESEND_API_KEY')).resolves.toBeNull();
      expect(secretExistsAWS).toHaveBeenCalledWith(
        { name: 'aws-client' },
        'shop-shared-RESEND_API_KEY',
      );
      expect(getSecretAWS).toHaveBeenCalledWith(
        { name: 'aws-client' },
        'shop-shared-RESEND_API_KEY',
      );
    });
  });

  describe('Azure', () => {
    it('should use the Key Vault name (underscores become hyphens)', async () => {
      rs.mocked(secretExistsAzure).mockResolvedValue(true);
      rs.mocked(getSecretAzure).mockResolvedValue('re_123');

      const reader = createSecretStoreReader({ ...base, provider: 'azure' });

      await reader.exists('RESEND_API_KEY');
      await reader.read('RESEND_API_KEY');
      expect(createAzureClient).toHaveBeenCalledWith(
        { subscriptionId: 'sub' },
        'shop',
        'prod',
      );
      expect(secretExistsAzure).toHaveBeenCalledWith(
        { name: 'azure-client' },
        'shop-shared-RESEND-API-KEY',
      );
      expect(getSecretAzure).toHaveBeenCalledWith(
        { name: 'azure-client' },
        'shop-shared-RESEND-API-KEY',
      );
    });
  });

  describe('Scope', () => {
    it('should use the given scope instead of shared', async () => {
      rs.mocked(secretExistsAWS).mockResolvedValue(true);

      const reader = createSecretStoreReader({ ...base, provider: 'aws' });
      await reader.exists('ADMIN_EMAILS', 'auth-service');

      expect(mocks.buildSecretName).toHaveBeenCalledWith(
        'shop',
        'auth-service',
        'ADMIN_EMAILS',
      );
      expect(secretExistsAWS).toHaveBeenCalledWith(
        { name: 'aws-client' },
        'shop-auth-service-ADMIN_EMAILS',
      );
    });
  });
});
