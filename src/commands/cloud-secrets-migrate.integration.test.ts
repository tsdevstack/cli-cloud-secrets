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
rs.mock('./cloud-secrets-set', { mock: true });
rs.mock('../utils/list-secret-moves', { mock: true });
rs.mock('../utils/create-old-secret-store', { mock: true });
rs.mock('../utils/create-secret-store-reader', { mock: true });

import { cloudSecretsMigrate } from './cloud-secrets-migrate';
import { cloudSecretsSet } from './cloud-secrets-set';
import { listSecretMoves } from '../utils/list-secret-moves';
import { createOldSecretStore } from '../utils/create-old-secret-store';
import { createSecretStoreReader } from '../utils/create-secret-store-reader';
import type { SecretMove } from '../utils/types';

describe('cloudSecretsMigrate', () => {
  const jwt: SecretMove = {
    key: 'JWT_PRIVATE_KEY_CURRENT',
    scope: 'auth-service',
    oldScope: 'shared',
  };
  // Azure: an older CLI's copy of a service secret in the shared vault
  const adminInSharedVault: SecretMove = {
    key: 'ADMIN_EMAILS',
    scope: 'auth-service',
    oldScope: 'auth-service',
  };
  const adminInShared: SecretMove = {
    key: 'ADMIN_EMAILS',
    scope: 'auth-service',
    oldScope: 'shared',
  };

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

  beforeEach(() => {
    rs.resetAllMocks();
    mocks.findProjectRoot.mockReturnValue('/project');
    mocks.loadFrameworkConfig.mockReturnValue({
      project: { name: 'shop' },
      cloud: { provider: 'gcp' },
      services: [],
    });
    mocks.getAvailableEnvironments.mockReturnValue(['dev', 'prod']);
    mocks.resolveEnvironment.mockResolvedValue('dev');
    rs.mocked(createOldSecretStore).mockReturnValue(oldStore);
    rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);
  });

  describe('Standard use cases', () => {
    it('should copy an old copy into its scope', async () => {
      given([jwt], { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' });

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        undefined,
        {
          value: 'key-1',
          env: 'dev',
          service: 'auth-service',
          overwrite: false,
          internal: true,
        },
      );
    });

    it('should leave a new copy with the same value', async () => {
      given(
        [jwt],
        { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
        { 'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
      );

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '   JWT_PRIVATE_KEY_CURRENT (auth-service): already in place',
      );
    });

    it('should never delete an old copy', async () => {
      given([jwt], { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' });

      await cloudSecretsMigrate({ env: 'dev' });

      expect(oldStore.remove).not.toHaveBeenCalled();
    });

    it('should resolve the environment from the options', async () => {
      given([], {});

      await cloudSecretsMigrate({ env: 'prod' });

      expect(mocks.resolveEnvironment).toHaveBeenCalledWith(
        { env: 'prod' },
        ['dev', 'prod'],
        'cloud-secrets:migrate',
      );
    });
  });

  describe('Different values', () => {
    it('should not overwrite a new copy with a different value', async () => {
      given(
        [jwt],
        { 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' },
        { 'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-2' },
      );

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).not.toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        '   JWT_PRIVATE_KEY_CURRENT (auth-service): the new copy has a different value, left as it is',
      );
    });

    it('should copy only the first of two old copies with one new place', async () => {
      given([adminInShared, adminInSharedVault], {
        'shared/ADMIN_EMAILS': 'a@example.com',
        'auth-service/ADMIN_EMAILS': 'b@example.com',
      });

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).toHaveBeenCalledTimes(1);
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        undefined,
        expect.objectContaining({ value: 'a@example.com' }),
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        '   ADMIN_EMAILS (auth-service): the new copy has a different value, left as it is',
      );
    });

    it('should count a second old copy with the copied value as in place', async () => {
      given([adminInShared, adminInSharedVault], {
        'shared/ADMIN_EMAILS': 'a@example.com',
        'auth-service/ADMIN_EMAILS': 'a@example.com',
      });

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).toHaveBeenCalledTimes(1);
      expect(mocks.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should copy nothing when no old copy exists', async () => {
      given([jwt], {});

      await cloudSecretsMigrate({ env: 'dev' });

      expect(cloudSecretsSet).not.toHaveBeenCalled();
      expect(mocks.logger.success).toHaveBeenCalledWith(
        'Nothing to copy: no secret is left in an old place',
      );
    });
  });

  describe('Error handling', () => {
    it('should fail without a cloud provider', async () => {
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'shop' },
        cloud: { provider: 'local' },
        services: [],
      });

      await expect(cloudSecretsMigrate({ env: 'dev' })).rejects.toThrow(
        'Cloud provider not configured in config.json',
      );
      expect(listSecretMoves).not.toHaveBeenCalled();
    });

    it('should fail outside a project', async () => {
      mocks.findProjectRoot.mockReturnValue(null);

      await expect(cloudSecretsMigrate({ env: 'dev' })).rejects.toThrow(
        'Could not find project root',
      );
    });
  });
});
