import { describe, it, expect } from '@rstest/core';
import { extractKeyAndScopeFromSecretName } from './extract-key-and-scope-from-secret-name';

describe('extractKeyAndScopeFromSecretName', () => {
  describe('shared secrets', () => {
    it('should extract key and scope from shared secret', () => {
      const result = extractKeyAndScopeFromSecretName(
        'tsdevstack-shared-DATABASE_URL',
        'tsdevstack',
      );

      expect(result).toEqual({ key: 'DATABASE_URL', scope: 'shared' });
    });

    it('should handle keys with multiple underscores', () => {
      const result = extractKeyAndScopeFromSecretName(
        'myproject-shared-MY_COMPLEX_SECRET_KEY',
        'myproject',
      );

      expect(result).toEqual({ key: 'MY_COMPLEX_SECRET_KEY', scope: 'shared' });
    });
  });

  describe('service-scoped secrets', () => {
    it('should extract key and scope from service-scoped secret', () => {
      const result = extractKeyAndScopeFromSecretName(
        'tsdevstack-auth-service-DATABASE_URL',
        'tsdevstack',
      );

      expect(result).toEqual({ key: 'DATABASE_URL', scope: 'auth-service' });
    });

    it('should handle service names with multiple hyphens', () => {
      const result = extractKeyAndScopeFromSecretName(
        'myproject-my-cool-service-API_KEY',
        'myproject',
      );

      expect(result).toEqual({ key: 'API_KEY', scope: 'my-cool-service' });
    });
  });

  describe('error cases', () => {
    it('should return null if secret name does not match project prefix', () => {
      const result = extractKeyAndScopeFromSecretName(
        'wrongproject-shared-DATABASE_URL',
        'tsdevstack',
      );

      expect(result).toBe(null);
    });

    it('should return null for invalid format without uppercase key', () => {
      const result = extractKeyAndScopeFromSecretName(
        'tsdevstack-shared-lowercase',
        'tsdevstack',
      );

      expect(result).toBe(null);
    });

    it('should return null for completely wrong format', () => {
      const result = extractKeyAndScopeFromSecretName(
        'just-a-random-name',
        'myproject',
      );

      expect(result).toBe(null);
    });

    it('should be case sensitive for project name', () => {
      const result = extractKeyAndScopeFromSecretName(
        'MyProject-shared-KEY',
        'myproject',
      );

      expect(result).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('should handle keys with numbers', () => {
      const result = extractKeyAndScopeFromSecretName(
        'project-shared-API_KEY_V2',
        'project',
      );

      expect(result).toEqual({ key: 'API_KEY_V2', scope: 'shared' });
    });

    it('should handle single character keys', () => {
      const result = extractKeyAndScopeFromSecretName(
        'project-shared-A',
        'project',
      );

      expect(result).toEqual({ key: 'A', scope: 'shared' });
    });
  });
});
