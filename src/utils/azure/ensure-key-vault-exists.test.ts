import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { AzureCredentials } from '../types';

const mockVaultsGet = rs.fn();
const mockVaultsBeginCreateOrUpdateAndWait = rs.fn();

rs.mock('./create-azure-credential', () => ({
  createAzureCredential: rs.fn(() => ({})),
}));

rs.mock('@azure/arm-keyvault', () => {
  return {
    KeyVaultManagementClient: class MockKeyVaultManagementClient {
      vaults = {
        get: mockVaultsGet,
        beginCreateOrUpdateAndWait: mockVaultsBeginCreateOrUpdateAndWait,
      };
      constructor() {}
    },
  };
});

import { ensureKeyVaultExists } from './ensure-key-vault-exists';

describe('ensureKeyVaultExists', () => {
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

  it('should return exists=true, created=false when Key Vault already exists', async () => {
    mockVaultsGet.mockResolvedValue({ name: 'myproject-dev-kv' });

    const result = await ensureKeyVaultExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result).toEqual({ exists: true, created: false });
    expect(mockVaultsGet).toHaveBeenCalledWith(
      'myproject-dev-rg',
      'myproject-dev-kv',
    );
    expect(mockVaultsBeginCreateOrUpdateAndWait).not.toHaveBeenCalled();
  });

  it('should create Key Vault with RBAC authorization when it does not exist', async () => {
    mockVaultsGet.mockRejectedValue({ statusCode: 404 });
    mockVaultsBeginCreateOrUpdateAndWait.mockResolvedValue({});

    const result = await ensureKeyVaultExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result).toEqual({ exists: true, created: true });
    expect(mockVaultsBeginCreateOrUpdateAndWait).toHaveBeenCalledWith(
      'myproject-dev-rg',
      'myproject-dev-kv',
      expect.objectContaining({
        location: 'eastus',
        properties: expect.objectContaining({
          tenantId: 'test-tenant-id',
          enableRbacAuthorization: true,
          accessPolicies: [],
        }),
        tags: expect.objectContaining({
          'managed-by': 'tsdevstack',
          project: 'myproject',
          environment: 'dev',
        }),
      }),
    );
  });

  it('should return error when Key Vault get fails with non-404 error', async () => {
    const error = new Error('Permission denied');
    (error as Error & { statusCode: number }).statusCode = 403;
    mockVaultsGet.mockRejectedValue(error);

    const result = await ensureKeyVaultExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.exists).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toBe('Permission denied');
  });

  it('should return error when Key Vault creation fails', async () => {
    mockVaultsGet.mockRejectedValue({ statusCode: 404 });
    mockVaultsBeginCreateOrUpdateAndWait.mockRejectedValue(
      new Error('Quota exceeded'),
    );

    const result = await ensureKeyVaultExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.exists).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toBe('Quota exceeded');
  });

  it('should handle non-Error exceptions', async () => {
    mockVaultsGet.mockRejectedValue({ statusCode: 404 });
    mockVaultsBeginCreateOrUpdateAndWait.mockRejectedValue('string error');

    const result = await ensureKeyVaultExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.error).toBe('Unknown error creating Key Vault');
  });
});
