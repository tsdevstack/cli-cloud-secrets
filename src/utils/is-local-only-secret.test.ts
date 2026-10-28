import { describe, it, expect } from '@rstest/core';
import { isLocalOnlySecret } from './is-local-only-secret';

describe('isLocalOnlySecret', () => {
  describe('Standard use cases', () => {
    it('should treat local runtime settings as local-only', () => {
      expect(isLocalOnlySecret('NODE_ENV')).toBe(true);
      expect(isLocalOnlySecret('SECRETS_PROVIDER')).toBe(true);
      expect(isLocalOnlySecret('KONG_SERVICE_HOST')).toBe(true);
    });

    it('should treat the local object storage connection as local-only', () => {
      expect(isLocalOnlySecret('STORAGE_ENDPOINT')).toBe(true);
      expect(isLocalOnlySecret('STORAGE_ACCESS_KEY')).toBe(true);
      expect(isLocalOnlySecret('STORAGE_SECRET_KEY')).toBe(true);
      expect(isLocalOnlySecret('STORAGE_FORCE_PATH_STYLE')).toBe(true);
    });

    it('should treat local database usernames as local-only', () => {
      expect(isLocalOnlySecret('DB_AUTH_USERNAME')).toBe(true);
      expect(isLocalOnlySecret('DB_USER_PROFILE_USERNAME')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should keep database passwords (infra:deploy reads them on GCP)', () => {
      expect(isLocalOnlySecret('DB_AUTH_PASSWORD')).toBe(false);
    });

    it('should keep bucket names and other cloud secrets', () => {
      expect(isLocalOnlySecret('STORAGE_BUCKET_UPLOADS')).toBe(false);
      expect(isLocalOnlySecret('KONG_TRUST_TOKEN')).toBe(false);
      expect(isLocalOnlySecret('USERNAME')).toBe(false);
    });
  });
});
