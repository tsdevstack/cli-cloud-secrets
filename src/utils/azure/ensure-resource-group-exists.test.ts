import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { AzureCredentials } from '../types';

const mockGet = rs.fn();
const mockCreateOrUpdate = rs.fn();

rs.mock('../../context', () => ({
  getContext: () =>
    (globalThis as unknown as { contextMocks: unknown }).contextMocks,
}));

rs.mock('@azure/arm-resources', () => {
  return {
    ResourceManagementClient: class MockResourceManagementClient {
      resourceGroups = {
        get: mockGet,
        createOrUpdate: mockCreateOrUpdate,
      };
      constructor() {}
    },
  };
});

import { ensureResourceGroupExists } from './ensure-resource-group-exists';

describe('ensureResourceGroupExists', () => {
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

  it('should return exists=true, created=false when resource group already exists', async () => {
    mockGet.mockResolvedValue({ name: 'myproject-dev-rg' });

    const result = await ensureResourceGroupExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result).toEqual({ exists: true, created: false });
    expect(mockGet).toHaveBeenCalledWith('myproject-dev-rg');
    expect(mockCreateOrUpdate).not.toHaveBeenCalled();
  });

  it('should create resource group when it does not exist', async () => {
    const error = { statusCode: 404 };
    mockGet.mockRejectedValue(error);
    mockCreateOrUpdate.mockResolvedValue({ name: 'myproject-dev-rg' });

    const result = await ensureResourceGroupExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result).toEqual({ exists: true, created: true });
    expect(mockCreateOrUpdate).toHaveBeenCalledWith('myproject-dev-rg', {
      location: 'eastus',
      tags: {
        'managed-by': 'tsdevstack',
        project: 'myproject',
        environment: 'dev',
      },
    });
  });

  it('should return error when get fails with non-404 error', async () => {
    const error = new Error('Permission denied');
    (error as Error & { statusCode: number }).statusCode = 403;
    mockGet.mockRejectedValue(error);

    const result = await ensureResourceGroupExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.exists).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toBe('Permission denied');
  });

  it('should return error when createOrUpdate fails', async () => {
    mockGet.mockRejectedValue({ statusCode: 404 });
    mockCreateOrUpdate.mockRejectedValue(new Error('Quota exceeded'));

    const result = await ensureResourceGroupExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.exists).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toBe('Quota exceeded');
  });

  it('should handle different environments', async () => {
    mockGet.mockResolvedValue({ name: 'app-prod-rg' });

    await ensureResourceGroupExists('app', 'prod', mockCredentials);

    expect(mockGet).toHaveBeenCalledWith('app-prod-rg');
  });

  it('should handle non-Error exceptions', async () => {
    mockGet.mockRejectedValue({ statusCode: 404 });
    mockCreateOrUpdate.mockRejectedValue('string error');

    const result = await ensureResourceGroupExists(
      'myproject',
      'dev',
      mockCredentials,
    );

    expect(result.error).toBe('Unknown error creating resource group');
  });
});
