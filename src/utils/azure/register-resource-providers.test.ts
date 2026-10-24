import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { AzureCredentials } from '../types';

const mockRegister = rs.fn();
const mockGet = rs.fn();

rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

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

  /** Registration state per provider; anything not listed is Registered */
  const withStates = (states: Record<string, string>): void => {
    mockGet.mockImplementation(async (provider: string) => ({
      registrationState: states[provider] ?? 'Registered',
    }));
  };

  describe('Standard use cases', () => {
    it('should check every provider an environment needs', async () => {
      withStates({});

      const result = await registerResourceProviders(mockCredentials);

      expect(mockGet).toHaveBeenCalledTimes(12);
      expect(mockGet).toHaveBeenCalledWith('Microsoft.App');
      expect(mockGet).toHaveBeenCalledWith('Microsoft.DBforPostgreSQL');
      expect(mockGet).toHaveBeenCalledWith('Microsoft.KeyVault');
      expect(result).toEqual({
        success: true,
        registering: [],
        unregistered: [],
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should register only the providers that are not registered', async () => {
      withStates({
        'Microsoft.App': 'NotRegistered',
        'Microsoft.Cdn': 'Unregistered',
      });
      mockRegister.mockResolvedValue(undefined);

      const result = await registerResourceProviders(mockCredentials);

      expect(mockRegister).toHaveBeenCalledTimes(2);
      expect(mockRegister).toHaveBeenCalledWith('Microsoft.App');
      expect(mockRegister).toHaveBeenCalledWith('Microsoft.Cdn');
      expect(result.success).toBe(true);
      expect(result.registering).toEqual(['Microsoft.App', 'Microsoft.Cdn']);
    });
  });

  describe('Failures', () => {
    it('should name the unregistered providers and how to register them without permission', async () => {
      withStates({
        'Microsoft.App': 'NotRegistered',
        'Microsoft.Cache': 'NotRegistered',
      });
      mockRegister.mockRejectedValue(
        new Error('The client does not have authorization to perform action'),
      );

      const result = await registerResourceProviders(mockCredentials);

      expect(result.success).toBe(false);
      expect(result.unregistered).toEqual(['Microsoft.App', 'Microsoft.Cache']);
      expect(result.error).toContain(
        'Not registered: Microsoft.App, Microsoft.Cache',
      );
      expect(result.error).toContain('Settings → Resource providers');
      expect(result.error).toContain(
        'az provider register --subscription test-subscription-id --namespace <name>',
      );
      expect(result.error).toContain('Contributor role on the subscription');
    });

    it('should return the error when registration fails otherwise', async () => {
      withStates({ 'Microsoft.App': 'NotRegistered' });
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
});
