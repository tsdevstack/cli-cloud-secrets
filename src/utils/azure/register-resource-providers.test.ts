import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { AzureCredentials } from '../types';

const mockRegister = rs.fn();
const mockGet = rs.fn();

rs.mock('./create-azure-credential', () => ({
  createAzureCredential: rs.fn(() => ({})),
}));

rs.mock('@azure/arm-resources', () => {
  return {
    ResourceManagementClient: class MockResourceManagementClient {
      providers = {
        register: mockRegister,
        get: mockGet,
      };
      constructor() {}
    },
  };
});

import { registerResourceProviders } from './register-resource-providers';

describe('registerResourceProviders', () => {
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

  it('should skip registration when provider is already registered', async () => {
    mockGet.mockResolvedValue({ registrationState: 'Registered' });

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(true);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('should register provider when not registered', async () => {
    mockGet.mockResolvedValue({ registrationState: 'NotRegistered' });
    mockRegister.mockResolvedValue(undefined);

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(true);
    expect(mockRegister).toHaveBeenCalledWith('Microsoft.KeyVault');
  });

  it('should return permission error when authorization fails', async () => {
    mockGet.mockResolvedValue({ registrationState: 'NotRegistered' });
    mockRegister.mockRejectedValue(
      new Error('does not have authorization to perform action'),
    );

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient permissions');
    expect(result.error).toContain('subscription-level Contributor');
  });

  it('should return error when registration fails', async () => {
    mockGet.mockResolvedValue({ registrationState: 'NotRegistered' });
    mockRegister.mockRejectedValue(new Error('Registration failed'));

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Registration failed');
  });

  it('should handle non-Error exceptions', async () => {
    mockGet.mockRejectedValue('string error');

    const result = await registerResourceProviders(mockCredentials);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error registering providers');
  });
});
