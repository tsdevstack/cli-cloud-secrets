import { describe, it, expect, rs } from '@rstest/core';

rs.mock('../context', () => ({
  getContext: () => ({ SHARED_SECRET_SCOPE: 'shared' }),
}));

import { planScopedSecretPush } from './plan-scoped-secret-push';
import type { SecretStoreReader } from './types';

/** A store over { scope: { KEY: value } } */
const storeWith = (
  scopes: Record<string, Record<string, string>>,
): SecretStoreReader => ({
  exists: rs.fn(async (key: string, scope = 'shared') =>
    Boolean(scopes[scope] && key in scopes[scope]),
  ),
  read: rs.fn(
    async (key: string, scope = 'shared') => scopes[scope]?.[key] ?? null,
  ),
});

describe('planScopedSecretPush', () => {
  describe('Standard use cases', () => {
    it('should create the generated value in a new environment', async () => {
      const store = storeWith({});

      await expect(
        planScopedSecretPush(
          store,
          'JWT_PRIVATE_KEY_CURRENT',
          'auth-service',
          'new-key',
        ),
      ).resolves.toEqual({ action: 'create', value: 'new-key' });
    });

    it('should skip a secret already in its scope', async () => {
      const store = storeWith({
        'auth-service': { JWT_PRIVATE_KEY_CURRENT: 'current-key' },
      });

      await expect(
        planScopedSecretPush(
          store,
          'JWT_PRIVATE_KEY_CURRENT',
          'auth-service',
          'new-key',
        ),
      ).resolves.toEqual({ action: 'skip' });
      expect(store.read).not.toHaveBeenCalled();
    });

    it('should carry the shared value over instead of the generated one', async () => {
      const store = storeWith({
        shared: { JWT_PRIVATE_KEY_CURRENT: 'existing-key' },
      });

      await expect(
        planScopedSecretPush(
          store,
          'JWT_PRIVATE_KEY_CURRENT',
          'auth-service',
          'new-key',
        ),
      ).resolves.toEqual({ action: 'copy', value: 'existing-key' });
    });
  });

  describe('Edge cases', () => {
    it('should keep the scoped value even when shared has another one', async () => {
      const store = storeWith({
        shared: { REFRESH_TOKEN_SECRET: 'old' },
        'auth-service': { REFRESH_TOKEN_SECRET: 'current' },
      });

      await expect(
        planScopedSecretPush(
          store,
          'REFRESH_TOKEN_SECRET',
          'auth-service',
          'new',
        ),
      ).resolves.toEqual({ action: 'skip' });
    });

    it('should fail when the store cannot be read', async () => {
      const store: SecretStoreReader = {
        exists: rs.fn().mockRejectedValue(new Error('access denied')),
        read: rs.fn(),
      };

      await expect(
        planScopedSecretPush(store, 'BCRYPT_ROUNDS', 'auth-service', '12'),
      ).rejects.toThrow('access denied');
    });
  });
});
