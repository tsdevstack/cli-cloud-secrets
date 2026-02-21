import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { AzureCredentials } from '../types';

const mockRegister = rs.fn();

rs.mock('./create-azure-credential', () => ({
  createAzureCredential: rs.fn(() => ({})),
}));

rs.mock('@azure/arm-resources', () => {
  return {
    ResourceManagementClient: class MockResourceManagementClient {
      providers = {
        register: mockRegister,
      };
      constructor() {}
    },
  };
});

import { registerResourceProviders } from './register-resource-providers';

describe('registerResourceProviders', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
  });

  const mockCredentials: AzureCredentials = {
    tenantId: 'test-tenant-id',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    subscriptionId: 'test-subscription-id',
    location: 'eastus',
  };

  it('should register Microsoft.KeyVault provider', async () => {
    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockRegister).toHaveBeenCalledWith('Microsoft.KeyVault');
  });

  it('should return error when registration fails', async () => {
    mockRegister.mockRejectedValue(new Error('Registration failed'));

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Registration failed');
  });

  it('should handle non-Error exceptions', async () => {
    mockRegister.mockRejectedValue('string error');

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error registering providers');
  });
});
