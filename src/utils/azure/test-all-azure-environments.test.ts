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

const mockNextPage = rs.fn();
const mockByPage = rs.fn(() => ({ next: mockNextPage }));

rs.mock('./create-azure-client', () => ({
  createAzureClient: rs.fn(() => ({
    listPropertiesOfSecrets: () => ({ byPage: mockByPage }),
  })),
}));

import { testAllAzureEnvironments } from './test-all-azure-environments';
import { createAzureClient } from './create-azure-client';

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

    mockNextPage.mockResolvedValue({ done: true });

    const results = await testAllAzureEnvironments('/project');

    expect(createAzureClient).toHaveBeenCalledWith(
      createMockCredentials('dev'),
      'myproject',
      'dev',
    );
    expect(mockByPage).toHaveBeenCalledWith({ maxPageSize: 1 });
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

    mockNextPage.mockRejectedValue(new Error('Invalid credentials'));

    const results = await testAllAzureEnvironments('/project');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      env: 'dev',
      valid: false,
      error: 'Invalid credentials',
    });
  });

  it('should name the Key Vault role when the vault refuses access', async () => {
    mocks.loadCredentialsFile.mockReturnValue({
      dev: createMockCredentials('dev'),
    });
    const forbidden = new Error('Caller is not authorized');
    (forbidden as Error & { statusCode: number }).statusCode = 403;
    mockNextPage.mockRejectedValue(forbidden);

    const results = await testAllAzureEnvironments('/project');

    expect(results[0].valid).toBe(false);
    expect(results[0].error).toContain('Caller is not authorized');
    expect(results[0].error).toContain('Key Vault Secrets Officer');
  });

  it('should handle mixed valid and invalid environments', async () => {
    mocks.loadCredentialsFile.mockReturnValue({
      dev: createMockCredentials('dev'),
      staging: createMockCredentials('staging'),
    });

    mockNextPage
      .mockResolvedValueOnce({ done: true })
      .mockRejectedValueOnce(new Error('Auth failed'));

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
