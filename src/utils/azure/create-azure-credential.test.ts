import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from 'tsdevstack/test-utils';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

const isCIEnv = rs.fn();

rs.mock('../../context', () => ({
  getContext: rs.fn(() => ({
    ...mocks,
    isCIEnv,
  })),
}));

const { mockDefaultAzureCredential, mockClientSecretCredential } = rs.hoisted(
  () => ({
    mockDefaultAzureCredential: rs.fn(),
    mockClientSecretCredential: rs.fn(),
  }),
);

rs.mock('@azure/identity', () => ({
  DefaultAzureCredential: mockDefaultAzureCredential,
  ClientSecretCredential: mockClientSecretCredential,
}));

import { createAzureCredential } from './create-azure-credential';
import type { AzureCredentials } from '../types';

const mockCredentials: AzureCredentials = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  tenantId: 'test-tenant-id',
  subscriptionId: 'test-sub-id',
  location: 'eastus',
};

describe('createAzureCredential', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('CI mode', () => {
    it('should return DefaultAzureCredential in CI', () => {
      isCIEnv.mockReturnValue(true);

      createAzureCredential(mockCredentials);

      expect(mockDefaultAzureCredential).toHaveBeenCalledOnce();
      expect(mockClientSecretCredential).not.toHaveBeenCalled();
    });

    it('should not require clientSecret in CI', () => {
      isCIEnv.mockReturnValue(true);
      const ciCredentials: AzureCredentials = {
        clientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        subscriptionId: 'test-sub-id',
        location: 'eastus',
      };

      createAzureCredential(ciCredentials);

      expect(mockDefaultAzureCredential).toHaveBeenCalledOnce();
    });
  });

  describe('Local mode', () => {
    it('should return ClientSecretCredential with credentials', () => {
      isCIEnv.mockReturnValue(false);

      createAzureCredential(mockCredentials);

      expect(mockClientSecretCredential).toHaveBeenCalledWith(
        'test-tenant-id',
        'test-client-id',
        'test-client-secret',
      );
      expect(mockDefaultAzureCredential).not.toHaveBeenCalled();
    });

    it('should throw if clientSecret is missing in local mode', () => {
      isCIEnv.mockReturnValue(false);
      const localCredentials: AzureCredentials = {
        clientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        subscriptionId: 'test-sub-id',
        location: 'eastus',
      };

      expect(() => createAzureCredential(localCredentials)).toThrow(
        'Azure client secret is required for local development',
      );
    });
  });
});
