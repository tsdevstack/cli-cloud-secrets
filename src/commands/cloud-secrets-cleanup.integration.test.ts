import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));
rs.mock('inquirer', { mock: true });
rs.mock('../utils/list-secret-moves', { mock: true });
rs.mock('../utils/create-old-secret-store', { mock: true });
rs.mock('../utils/create-secret-store-reader', { mock: true });
rs.mock('../utils/azure/load-azure-credentials', { mock: true });
rs.mock('../utils/azure/list-apps-without-own-vault', { mock: true });

import inquirer from 'inquirer';
import { cloudSecretsCleanup } from './cloud-secrets-cleanup';
import { listSecretMoves } from '../utils/list-secret-moves';
import { createOldSecretStore } from '../utils/create-old-secret-store';
import { createSecretStoreReader } from '../utils/create-secret-store-reader';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { listAppsWithoutOwnVault } from '../utils/azure/list-apps-without-own-vault';
import type { SecretMove } from '../utils/types';

describe('cloudSecretsCleanup', () => {
  const move = (key: string, oldScope = 'shared'): SecretMove => ({
    key,
    scope: 'auth-service',
    oldScope,
  });
  const jwt = move('JWT_PRIVATE_KEY_CURRENT');
  const refresh = move('REFRESH_TOKEN_SECRET');
  const admin = move('ADMIN_EMAILS');

  const oldStore = { read: rs.fn(), remove: rs.fn() };

  /** Old copies by `oldScope/KEY`, new copies by `scope/KEY` */
  function given(
    moves: SecretMove[],
    oldCopies: Record<string, string>,
    newCopies: Record<string, string> = {},
  ): void {
    rs.mocked(listSecretMoves).mockResolvedValue(moves);
    oldStore.read.mockImplementation(
      async (key: string, oldScope: string) =>
        oldCopies[`${oldScope}/${key}`] ?? null,
    );
    rs.mocked(createSecretStoreReader).mockReturnValue({
      exists: rs.fn(),
      read: async (key: string, scope?: string) =>
        newCopies[`${scope}/${key}`] ?? null,
    });
  }

  function useProvider(provider: 'gcp' | 'azure'): void {
    mocks.loadFrameworkConfig.mockReturnValue({
      project: { name: 'shop' },
      cloud: { provider },
      services: [],
    });
  }

  beforeEach(() => {
    rs.resetAllMocks();
    mocks.findProjectRoot.mockReturnValue('/project');
    useProvider('gcp');
    mocks.getAvailableEnvironments.mockReturnValue(['dev']);
    mocks.resolveEnvironment.mockResolvedValue('dev');
    rs.mocked(createOldSecretStore).mockReturnValue(oldStore);
    oldStore.remove.mockResolvedValue(undefined);
    rs.mocked(inquirer.prompt).mockResolvedValue({ confirm: true });
  });

  describe('Standard use cases', () => {
    it('should delete the old copies with the same value and keep the rest', async () => {
      given(
        [jwt, refresh, admin],
        {
          'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          'shared/REFRESH_TOKEN_SECRET': 'secret-1',
          'shared/ADMIN_EMAILS': 'a@example.com',
        },
        {
          'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          // Changed after the copy
          'auth-service/REFRESH_TOKEN_SECRET': 'secret-2',
          // ADMIN_EMAILS not copied yet
        },
      );
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ confirm: true })
        .mockResolvedValueOnce({ confirm: false });

      await cloudSecretsCleanup({ env: 'dev' });

      expect(oldStore.remove).toHaveBeenCalledTimes(1);
      expect(oldStore.remove).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   ADMIN_EMAILS (shared)',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   REFRESH_TOKEN_SECRET (shared), new copy in auth-service',
      );
    });

    it('should ask before deleting', async () => {
      given(
        [jwt],
        { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
        { 'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
      );
      rs.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      await cloudSecretsCleanup({ env: 'dev' });

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(oldStore.remove).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith('Cancelled');
    });

    it('should delete without asking with --force', async () => {
      given(
        [jwt],
        { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
        { 'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
      );

      await cloudSecretsCleanup({ env: 'dev', force: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(oldStore.remove).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );
    });

    it('should not check Container Apps on GCP', async () => {
      given([], {});

      await cloudSecretsCleanup({ env: 'dev' });

      expect(listAppsWithoutOwnVault).not.toHaveBeenCalled();
    });
  });

  describe('Different values', () => {
    const changed = (): void =>
      given(
        [jwt, refresh],
        {
          'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          'shared/REFRESH_TOKEN_SECRET': 'secret-1',
        },
        {
          'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          'auth-service/REFRESH_TOKEN_SECRET': 'secret-2',
        },
      );

    it('should delete an old copy with a different value after a second question', async () => {
      changed();

      await cloudSecretsCleanup({ env: 'dev' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(inquirer.prompt).toHaveBeenLastCalledWith([
        expect.objectContaining({
          message: 'Delete these 1 old copies too?',
          default: false,
        }),
      ]);
      expect(oldStore.remove).toHaveBeenCalledWith(
        'REFRESH_TOKEN_SECRET',
        'shared',
      );
    });

    it('should ask only the second question when no copy has the same value', async () => {
      given(
        [refresh],
        { 'shared/REFRESH_TOKEN_SECRET': 'secret-1' },
        { 'auth-service/REFRESH_TOKEN_SECRET': 'secret-2' },
      );
      rs.mocked(inquirer.prompt).mockResolvedValue({ confirm: false });

      await cloudSecretsCleanup({ env: 'dev' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(oldStore.remove).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith('Kept');
    });

    it('should never delete an old copy with a different value with --force', async () => {
      changed();

      await cloudSecretsCleanup({ env: 'dev', force: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(oldStore.remove).toHaveBeenCalledTimes(1);
      expect(oldStore.remove).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        'shared',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Kept: --force never deletes these',
      );
    });
  });

  describe('Azure', () => {
    beforeEach(() => {
      useProvider('azure');
      rs.mocked(loadAzureCredentials).mockReturnValue({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        subscriptionId: 'sub',
        location: 'eastus',
      });
    });

    it('should refuse while an app still reads only the shared vault', async () => {
      rs.mocked(listAppsWithoutOwnVault).mockResolvedValue([
        'shop-auth-service',
      ]);

      await expect(cloudSecretsCleanup({ env: 'dev' })).rejects.toThrow(
        'These Container Apps still read their secrets from the shared vault: shop-auth-service',
      );
      expect(listSecretMoves).not.toHaveBeenCalled();
      expect(oldStore.remove).not.toHaveBeenCalled();
    });

    it('should delete once every app has its own vault', async () => {
      rs.mocked(listAppsWithoutOwnVault).mockResolvedValue([]);
      const adminInSharedVault = move('ADMIN_EMAILS', 'auth-service');
      given(
        [adminInSharedVault],
        { 'auth-service/ADMIN_EMAILS': 'a@example.com' },
        { 'auth-service/ADMIN_EMAILS': 'a@example.com' },
      );

      await cloudSecretsCleanup({ env: 'dev', force: true });

      expect(listAppsWithoutOwnVault).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: 'sub' }),
        'shop',
        'dev',
      );
      expect(oldStore.remove).toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        'auth-service',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   Deleted ADMIN_EMAILS (auth-service, shared vault)',
      );
    });
  });

  describe('Edge cases', () => {
    it('should not ask when nothing can be deleted', async () => {
      given([jwt], { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' });

      await cloudSecretsCleanup({ env: 'dev' });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(oldStore.remove).not.toHaveBeenCalled();
      expect(mocks.logger.success).toHaveBeenCalledWith('Nothing to delete');
    });
  });

  describe('Error handling', () => {
    it('should stop at a failed delete', async () => {
      given(
        [jwt, refresh],
        {
          'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          'shared/REFRESH_TOKEN_SECRET': 'secret-1',
        },
        {
          'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1',
          'auth-service/REFRESH_TOKEN_SECRET': 'secret-1',
        },
      );
      oldStore.remove.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        cloudSecretsCleanup({ env: 'dev', force: true }),
      ).rejects.toThrow('Permission denied');
      expect(oldStore.remove).toHaveBeenCalledTimes(1);
    });

    it('should fail without a cloud provider', async () => {
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'shop' },
        cloud: null,
        services: [],
      });

      await expect(cloudSecretsCleanup({ env: 'dev' })).rejects.toThrow(
        'Cloud provider not configured in config.json',
      );
    });
  });
});
