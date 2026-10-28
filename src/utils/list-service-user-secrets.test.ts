import { describe, it, expect } from '@rstest/core';
import { listServiceUserSecrets } from './list-service-user-secrets';
import type { FrameworkConfig, SecretsFile } from '@tsdevstack/cli/plugin';

const config = {
  project: { name: 'shop' },
  services: [
    { name: 'auth-service', type: 'nestjs' },
    { name: 'offers-service', type: 'nestjs' },
    { name: 'frontend', type: 'nextjs' },
  ],
} as unknown as FrameworkConfig;

describe('listServiceUserSecrets', () => {
  describe('Standard use cases', () => {
    it("should list each backend service's values in its own scope", () => {
      const file = {
        secrets: { SENTRY_DSN: 'dsn' },
        'offers-service': { STRIPE_API_KEY: 'sk_test' },
        'auth-service': { TWILIO_ACCOUNT_SID: 'AC1', ADMIN_EMAILS: 'a@b.c' },
      } as SecretsFile;

      expect(listServiceUserSecrets(file, config)).toEqual([
        { key: 'STRIPE_API_KEY', scope: 'offers-service', value: 'sk_test' },
        { key: 'TWILIO_ACCOUNT_SID', scope: 'auth-service', value: 'AC1' },
        { key: 'ADMIN_EMAILS', scope: 'auth-service', value: 'a@b.c' },
      ]);
    });
  });

  describe('Edge cases', () => {
    it('should leave out arrays, metadata, DATABASE_URL and local-only values', () => {
      const file = {
        'offers-service': {
          secrets: ['SENTRY_DSN'],
          $comment: 'note',
          DATABASE_URL: 'postgresql://local',
          STORAGE_ENDPOINT: 'http://localhost:9000',
          STRIPE_API_KEY: '',
        },
      } as unknown as SecretsFile;

      expect(listServiceUserSecrets(file, config)).toEqual([
        { key: 'STRIPE_API_KEY', scope: 'offers-service', value: '' },
      ]);
    });

    it('should leave out frontends and sections without a service', () => {
      const file = {
        frontend: { ANALYTICS_ID: 'GA-1' },
        'old-service': { KEY: 'v' },
      } as unknown as SecretsFile;

      expect(listServiceUserSecrets(file, config)).toEqual([]);
    });
  });
});
