import { describe, it, expect } from '@rstest/core';
import { parseAzureSecretName } from './parse-azure-secret-name';

describe('parseAzureSecretName', () => {
  describe('Standard use cases', () => {
    it('should parse a shared secret', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared-DATABASE-URL', 'tsdevstack'),
      ).toEqual({ key: 'DATABASE_URL', scope: 'shared' });
    });

    it('should parse a single-segment key', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared-DOMAIN', 'tsdevstack'),
      ).toEqual({ key: 'DOMAIN', scope: 'shared' });
    });

    it('should parse a service-scoped secret whose scope contains hyphens', () => {
      expect(
        parseAzureSecretName(
          'tsdevstack-auth-service-ADMIN-EMAILS',
          'tsdevstack',
        ),
      ).toEqual({ key: 'ADMIN_EMAILS', scope: 'auth-service' });
    });

    it('should parse a multi-hyphen key back to underscores', () => {
      expect(
        parseAzureSecretName(
          'tsdevstack-shared-JWT-PRIVATE-KEY-CURRENT',
          'tsdevstack',
        ),
      ).toEqual({ key: 'JWT_PRIVATE_KEY_CURRENT', scope: 'shared' });
    });

    it('should parse a multi-hyphen key in a multi-hyphen scope', () => {
      expect(
        parseAzureSecretName(
          'tsdevstack-user-management-service-DATABASE-URL',
          'tsdevstack',
        ),
      ).toEqual({ key: 'DATABASE_URL', scope: 'user-management-service' });
    });

    it('should keep digits in the key', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared-S3-BUCKET-2', 'tsdevstack'),
      ).toEqual({ key: 'S3_BUCKET_2', scope: 'shared' });
      expect(
        parseAzureSecretName('tsdevstack-shared-OAUTH2-SECRET', 'tsdevstack'),
      ).toEqual({ key: 'OAUTH2_SECRET', scope: 'shared' });
    });

    it('should keep digits in the scope', () => {
      expect(
        parseAzureSecretName(
          'tsdevstack-payment-v2-service-API-KEY',
          'tsdevstack',
        ),
      ).toEqual({ key: 'API_KEY', scope: 'payment-v2-service' });
    });

    it('should handle a project name that contains hyphens', () => {
      expect(
        parseAzureSecretName(
          'my-cool-app-auth-service-ADMIN-EMAILS',
          'my-cool-app',
        ),
      ).toEqual({ key: 'ADMIN_EMAILS', scope: 'auth-service' });
      expect(
        parseAzureSecretName('my-cool-app-shared-REDIS-HOST', 'my-cool-app'),
      ).toEqual({ key: 'REDIS_HOST', scope: 'shared' });
    });

    it('should handle a project name that contains digits', () => {
      expect(parseAzureSecretName('app2-shared-JWT-SECRET', 'app2')).toEqual({
        key: 'JWT_SECRET',
        scope: 'shared',
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for another project prefix', () => {
      expect(
        parseAzureSecretName('other-project-shared-API-KEY', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null when the project name only matches partially', () => {
      expect(
        parseAzureSecretName('tsdevstackx-shared-API-KEY', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null when there is no key', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared', 'tsdevstack'),
      ).toBeNull();
      expect(
        parseAzureSecretName('tsdevstack-shared-', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null when there is no scope', () => {
      expect(
        parseAzureSecretName('tsdevstack-API-KEY', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null for a lowercase key', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared-database-url', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null for a key that mixes cases', () => {
      expect(
        parseAzureSecretName('tsdevstack-shared-Database-Url', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null for an uppercase scope', () => {
      expect(
        parseAzureSecretName('tsdevstack-SHARED-API-KEY', 'tsdevstack'),
      ).toBeNull();
    });

    it('should return null for an unrelated name', () => {
      expect(
        parseAzureSecretName('just-a-random-name', 'tsdevstack'),
      ).toBeNull();
      expect(parseAzureSecretName('', 'tsdevstack')).toBeNull();
    });
  });
});
