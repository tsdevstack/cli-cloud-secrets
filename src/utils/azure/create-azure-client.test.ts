import { describe, it, expect, rs, beforeEach } from '@rstest/core';

// Mock Azure SDKs - define inside factory to avoid hoisting issues
rs.mock('@azure/keyvault-secrets', () => {
  return {
    SecretClient: class MockSecretClient {
      vaultUrl: string;
      credential: unknown;
      constructor(vaultUrl: string, credential: unknown) {
        this.vaultUrl = vaultUrl;
        this.credential = credential;
      }
    },
  };
});

rs.mock('../../context', () => ({
  getContext: () => ({
    // The legacy names (the scheme check is cli-core's own test)
    resolveKeyVaultName: async (
      _credentials: unknown,
      project: string,
      env: string,
      scope = 'shared',
    ) => `${project}-${env}-${scope === 'shared' ? 'kv' : scope}`,
    createAzureCredential: (credentials: {
      tenantId: string;
      clientId: string;
      clientSecret: string;
    }) => ({
      tenantId: credentials.tenantId,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    }),
  }),
}));

import { createAzureClient } from './create-azure-client';
import type { AzureCredentials } from '../types';

describe('createAzureClient', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  const mockCredentials: AzureCredentials = {
    tenantId: 'test-tenant-id',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    subscriptionId: 'test-subscription-id',
    location: 'eastus',
  };

  it('should create SecretClient with correct vault URL', async () => {
    const client = await createAzureClient(mockCredentials, 'myproject', 'dev');

    expect(client).toBeDefined();
    // Key vault name is derived from project name and env
    expect((client as unknown as { vaultUrl: string }).vaultUrl).toBe(
      'https://myproject-dev-kv.vault.azure.net',
    );
  });

  it('should create credentials with tenant, client, and secret', async () => {
    const client = await createAzureClient(
      mockCredentials,
      'testapp',
      'staging',
    );

    expect(client).toBeDefined();
    const cred = (
      client as unknown as {
        credential: {
          tenantId: string;
          clientId: string;
          clientSecret: string;
        };
      }
    ).credential;
    expect(cred.tenantId).toBe('test-tenant-id');
    expect(cred.clientId).toBe('test-client-id');
    expect(cred.clientSecret).toBe('test-client-secret');
  });

  it('should handle different environments', async () => {
    const devClient = await createAzureClient(mockCredentials, 'app', 'dev');
    const prodClient = await createAzureClient(mockCredentials, 'app', 'prod');

    expect((devClient as unknown as { vaultUrl: string }).vaultUrl).toBe(
      'https://app-dev-kv.vault.azure.net',
    );
    expect((prodClient as unknown as { vaultUrl: string }).vaultUrl).toBe(
      'https://app-prod-kv.vault.azure.net',
    );
  });

  it("should point at a service's own vault for its scope", async () => {
    const client = await createAzureClient(
      mockCredentials,
      'myproject',
      'dev',
      'auth-service',
    );
    expect((client as unknown as { vaultUrl: string }).vaultUrl).toBe(
      'https://myproject-dev-auth-service.vault.azure.net',
    );
  });

  it('should handle project names with hyphens', async () => {
    const client = await createAzureClient(
      mockCredentials,
      'my-project',
      'dev',
    );

    expect((client as unknown as { vaultUrl: string }).vaultUrl).toContain(
      'my-project-dev',
    );
  });
});
