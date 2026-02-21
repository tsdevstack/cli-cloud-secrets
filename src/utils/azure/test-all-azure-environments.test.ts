import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from '../../test-utils/mock-context';
import type { AzureCredentials } from '../types';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () => (globalThis as unknown as { contextMocks: MockContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

const mockVaultsList = rs.fn();

rs.mock('./create-azure-credential', () => ({
  createAzureCredential: rs.fn(() => ({})),
}));

rs.mock('@azure/arm-keyvault', () => {
  return {
    KeyVaultManagementClient: class MockKeyVaultManagementClient {
      vaults = {
        list: mockVaultsList,
      };
      constructor() {}
    },
  };
});

import { testAllAzureEnvironments } from './test-all-azure-environments';

describe('testAllAzureEnvironments', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mocks.loadFrameworkConfig.mockReturnValue({
      project: { name: 'myproject' },
    });
  });

  const createMockCredentials = (env: string): AzureCredentials => ({
    tenantId: `tenant-${env}`,
    clientId: `client-${env}`,
    clientSecret: `secret-${env}`,
    subscriptionId: `sub-${env}`,
    location: 'eastus',
  });

  it('should return valid results for all environments', async () => {
    mocks.loadCredentialsFile.mockReturnValue({
      dev: createMockCredentials('dev'),
      staging: createMockCredentials('staging'),
    });

    mockVaultsList.mockReturnValue({
      next: rs.fn().mockResolvedValue({ done: true }),
    });

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      env: 'dev',
      valid: true,
      projectId: 'myproject-dev-kv',
    });
    expect(results[1]).toEqual({
      env: 'staging',
      valid: true,
      projectId: 'myproject-staging-kv',
    });
  });

  it('should return invalid result when credentials test fails', async () => {
    mocks.loadCredentialsFile.mockReturnValue({
      dev: createMockCredentials('dev'),
    });

    mockVaultsList.mockReturnValue({
      next: rs.fn().mockRejectedValue(new Error('Invalid credentials')),
    });

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      env: 'dev',
      valid: false,
      error: 'Invalid credentials',
    });
  });

  it('should handle mixed valid and invalid environments', async () => {
    mocks.loadCredentialsFile.mockReturnValue({
      dev: createMockCredentials('dev'),
      staging: createMockCredentials('staging'),
    });

    let callCount = 0;
    mockVaultsList.mockImplementation(() => ({
      next: rs.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ done: true });
        }
        return Promise.reject(new Error('Auth failed'));
      }),
    }));

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.env === 'dev')?.valid).toBe(true);
    expect(results.find((r) => r.env === 'staging')?.valid).toBe(false);
  });

  it('should return error when credentials file fails to load', async () => {
    mocks.loadCredentialsFile.mockImplementation(() => {
      throw new Error('File not found');
    });

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      env: 'unknown',
      valid: false,
      error: 'File not found',
    });
  });

  it('should handle empty credentials file', async () => {
    mocks.loadCredentialsFile.mockReturnValue({});

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(0);
  });

  it('should handle non-Error exceptions', async () => {
    mocks.loadCredentialsFile.mockImplementation(() => {
      throw 'string error';
    });

    const results = await testAllAzureEnvironments('/project');

    expect(results[0].error).toBe('Failed to load credentials file');
  });
});
