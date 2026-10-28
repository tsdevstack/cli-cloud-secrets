import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';

const { listByResourceGroup } = rs.hoisted(() => ({
  listByResourceGroup: rs.fn(),
}));

rs.mock('@azure/arm-appcontainers', () => ({
  ContainerAppsAPIClient: class {
    containerApps = { listByResourceGroup };
  },
}));
rs.mock('../../context', () => ({
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
}));

import { listAppsWithoutOwnVault } from './list-apps-without-own-vault';

type App = { name: string; env: string[] };

function deployed(apps: App[]): void {
  listByResourceGroup.mockImplementation(async function* () {
    for (const app of apps) {
      yield {
        name: app.name,
        template: {
          containers: [{ env: app.env.map((name) => ({ name, value: 'x' })) }],
        },
      };
    }
  });
}

function failing(error: Error): void {
  listByResourceGroup.mockReturnValue({
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
  });
}

describe('listAppsWithoutOwnVault', () => {
  const credentials = {
    tenantId: 't',
    clientId: 'c',
    clientSecret: 's',
    subscriptionId: 'sub',
    location: 'eastus',
  };

  beforeEach(() => {
    rs.clearAllMocks();
  });

  describe('Standard use cases', () => {
    it('should list the apps that read only the shared vault', async () => {
      deployed([
        { name: 'shop-auth-service', env: ['AZURE_KEYVAULT_NAME'] },
        {
          name: 'shop-offers-service',
          env: ['AZURE_KEYVAULT_NAME', 'AZURE_SERVICE_KEYVAULT_NAME'],
        },
        { name: 'shop-auth-worker', env: ['AZURE_KEYVAULT_NAME'] },
      ]);

      expect(await listAppsWithoutOwnVault(credentials, 'shop', 'dev')).toEqual(
        ['shop-auth-service', 'shop-auth-worker'],
      );
      expect(listByResourceGroup).toHaveBeenCalledWith('shop-dev-rg');
    });

    it('should list nothing once every app has its own vault', async () => {
      deployed([
        {
          name: 'shop-auth-service',
          env: ['AZURE_KEYVAULT_NAME', 'AZURE_SERVICE_KEYVAULT_NAME'],
        },
      ]);

      expect(await listAppsWithoutOwnVault(credentials, 'shop', 'dev')).toEqual(
        [],
      );
    });
  });

  describe('Edge cases', () => {
    it("should skip apps that do not read Key Vault and other projects' apps", async () => {
      deployed([
        { name: 'shop-tools', env: ['NODE_ENV'] },
        { name: 'other-auth-service', env: ['AZURE_KEYVAULT_NAME'] },
      ]);

      expect(await listAppsWithoutOwnVault(credentials, 'shop', 'dev')).toEqual(
        [],
      );
    });

    it('should list nothing when the resource group does not exist', async () => {
      failing(
        Object.assign(new Error('Resource group not found'), {
          statusCode: 404,
        }),
      );

      expect(await listAppsWithoutOwnVault(credentials, 'shop', 'dev')).toEqual(
        [],
      );
    });
  });

  describe('Error handling', () => {
    it('should throw when the apps cannot be read', async () => {
      failing(Object.assign(new Error('Forbidden'), { statusCode: 403 }));

      await expect(
        listAppsWithoutOwnVault(credentials, 'shop', 'dev'),
      ).rejects.toThrow(
        'Could not check the deployed Container Apps: Forbidden',
      );
    });
  });
});
