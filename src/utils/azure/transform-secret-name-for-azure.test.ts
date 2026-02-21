import { describe, it, expect } from '@rstest/core';
import { transformSecretNameForAzure } from './transform-secret-name-for-azure';

describe('transformSecretNameForAzure', () => {
  describe('Standard use cases', () => {
    it('should replace underscores with hyphens', () => {
      expect(
        transformSecretNameForAzure('tsdevstack-shared-DATABASE_URL'),
      ).toBe('tsdevstack-shared-DATABASE-URL');
    });

    it('should handle multiple underscores', () => {
      expect(transformSecretNameForAzure('my_project_shared_API_KEY')).toBe(
        'my-project-shared-API-KEY',
      );
    });

    it('should handle names with mixed characters', () => {
      expect(
        transformSecretNameForAzure('project123-shared-JWT_SECRET_KEY'),
      ).toBe('project123-shared-JWT-SECRET-KEY');
    });
  });

  describe('Edge cases', () => {
    it('should handle names without underscores', () => {
      expect(transformSecretNameForAzure('tsdevstack-shared-apikey')).toBe(
        'tsdevstack-shared-apikey',
      );
    });

    it('should handle empty string', () => {
      expect(transformSecretNameForAzure('')).toBe('');
    });

    it('should handle single underscore', () => {
      expect(transformSecretNameForAzure('_')).toBe('-');
    });

    it('should handle consecutive underscores', () => {
      expect(transformSecretNameForAzure('project__shared__key')).toBe(
        'project--shared--key',
      );
    });

    it('should preserve hyphens that are already present', () => {
      expect(transformSecretNameForAzure('my-project_shared_KEY')).toBe(
        'my-project-shared-KEY',
      );
    });
  });
});
