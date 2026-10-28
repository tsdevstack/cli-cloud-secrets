import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../context', () => ({
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
}));
rs.mock('./azure/list-secrets-with-keys', { mock: true });

import { listSecretMoves } from './list-secret-moves';
import { listSecretsWithKeys as listAzureSecretsWithKeys } from './azure/list-secrets-with-keys';

const AUTH_MOVES = [
  'JWT_PRIVATE_KEY_CURRENT',
  'JWT_PUBLIC_KEY_CURRENT',
  'JWT_KEY_ID_CURRENT',
  'JWT_PRIVATE_KEY_PREVIOUS',
  'JWT_PUBLIC_KEY_PREVIOUS',
  'JWT_KEY_ID_PREVIOUS',
  'REFRESH_TOKEN_SECRET',
  'BCRYPT_ROUNDS',
  'ADMIN_EMAILS',
].map((key) => ({ key, scope: 'auth-service', oldScope: 'shared' }));

describe('listSecretMoves', () => {
  const config = {
    project: { name: 'shop', version: '1.0.0' },
    services: [
      { name: 'auth-service', type: 'nestjs' },
      { name: 'offers-service', type: 'nestjs' },
      { name: 'frontend', type: 'nextjs' },
    ],
  } as Parameters<typeof listSecretMoves>[0]['config'];

  const target = (provider: 'gcp' | 'aws' | 'azure') => ({
    provider,
    projectRoot: '/project',
    projectName: 'shop',
    env: 'dev',
    config,
  });

  beforeEach(() => {
    rs.clearAllMocks();
    mocks.hasAuthTemplate.mockReturnValue(true);
  });

  describe('Standard use cases', () => {
    it('should move the auth secrets out of shared', async () => {
      expect(await listSecretMoves(target('gcp'))).toEqual(AUTH_MOVES);
      expect(listAzureSecretsWithKeys).not.toHaveBeenCalled();
    });

    it("should move each backend service's secrets out of the Azure shared vault", async () => {
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue([
        { key: 'KONG_TRUST_TOKEN', scope: 'shared' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service' },
        { key: 'DATABASE_URL', scope: 'offers-service' },
      ]);

      const moves = await listSecretMoves(target('azure'));

      expect(moves).toEqual([
        ...AUTH_MOVES,
        {
          key: 'ADMIN_EMAILS',
          scope: 'auth-service',
          oldScope: 'auth-service',
        },
        {
          key: 'DATABASE_URL',
          scope: 'offers-service',
          oldScope: 'offers-service',
        },
      ]);
      // The shared vault only
      expect(listAzureSecretsWithKeys).toHaveBeenCalledWith(
        '/project',
        'dev',
        'shop',
      );
    });
  });

  describe('Edge cases', () => {
    it('should move nothing out of shared without the auth template', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);

      expect(await listSecretMoves(target('aws'))).toEqual([]);
    });

    it('should leave shared-vault secrets of scopes without their own vault', async () => {
      rs.mocked(listAzureSecretsWithKeys).mockResolvedValue([
        // A Next.js service and a service no longer in config.json
        { key: 'API_URL', scope: 'frontend' },
        { key: 'DATABASE_URL', scope: 'old-service' },
      ]);

      expect(await listSecretMoves(target('azure'))).toEqual(AUTH_MOVES);
    });
  });
});
