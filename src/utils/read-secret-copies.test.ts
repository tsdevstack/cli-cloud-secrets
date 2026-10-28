import { describe, it, expect } from '@rstest/core';
import { readSecretCopies } from './read-secret-copies';
import type { OldSecretStore, SecretStoreReader } from './types';

function storeOf(values: Record<string, string>): SecretStoreReader {
  return {
    exists: async (key, scope = 'shared') => `${scope}/${key}` in values,
    read: async (key, scope = 'shared') => values[`${scope}/${key}`] ?? null,
  };
}

function oldStoreOf(values: Record<string, string>): OldSecretStore {
  return {
    read: async (key, oldScope) => values[`${oldScope}/${key}`] ?? null,
    remove: async () => {},
  };
}

describe('readSecretCopies', () => {
  const jwtMove = {
    key: 'JWT_PRIVATE_KEY_CURRENT',
    scope: 'auth-service',
    oldScope: 'shared',
  };
  const adminMove = {
    key: 'ADMIN_EMAILS',
    scope: 'auth-service',
    oldScope: 'shared',
  };

  describe('Standard use cases', () => {
    it('should read the old copy in its old scope and the new one in its scope', async () => {
      const copies = await readSecretCopies(
        [jwtMove],
        oldStoreOf({ 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' }),
        storeOf({ 'auth-service/JWT_PRIVATE_KEY_CURRENT': 'key-1' }),
      );

      expect(copies).toEqual([
        { move: jwtMove, oldValue: 'key-1', newValue: 'key-1' },
      ]);
    });

    it('should report a missing new copy as null', async () => {
      const copies = await readSecretCopies(
        [jwtMove],
        oldStoreOf({ 'shared/JWT_PRIVATE_KEY_CURRENT': 'key-1' }),
        storeOf({}),
      );

      expect(copies).toEqual([
        { move: jwtMove, oldValue: 'key-1', newValue: null },
      ]);
    });
  });

  describe('Edge cases', () => {
    it('should leave out moves without an old copy and keep the order', async () => {
      const copies = await readSecretCopies(
        [jwtMove, adminMove],
        oldStoreOf({ 'shared/ADMIN_EMAILS': 'a@example.com' }),
        storeOf({}),
      );

      expect(copies.map((copy) => copy.move)).toEqual([adminMove]);
    });

    it('should return nothing without moves', async () => {
      expect(await readSecretCopies([], oldStoreOf({}), storeOf({}))).toEqual(
        [],
      );
    });
  });
});
