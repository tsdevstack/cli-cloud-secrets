import { describe, it, expect } from '@rstest/core';
import { buildKeyVaultName } from './build-key-vault-name';

describe('buildKeyVaultName', () => {
  describe('Standard use cases', () => {
    it('should build key vault name with project and environment', () => {
      expect(buildKeyVaultName('myproject', 'dev')).toBe('myproject-dev-kv');
    });

    it('should lowercase the name', () => {
      expect(buildKeyVaultName('MyProject', 'DEV')).toBe('myproject-dev-kv');
    });

    it('should handle production environment', () => {
      expect(buildKeyVaultName('webapp', 'prod')).toBe('webapp-prod-kv');
    });
  });

  describe('Sanitization', () => {
    it('should remove special characters', () => {
      expect(buildKeyVaultName('my_project!', 'dev@123')).toBe(
        'myproject-dev123-kv',
      );
    });

    it('should remove underscores', () => {
      // Underscores are removed completely, not replaced
      expect(buildKeyVaultName('my_awesome_project', 'test')).toBe(
        'myawesomeproject-test-kv',
      );
    });

    it('should preserve hyphens', () => {
      expect(buildKeyVaultName('my-project', 'dev-env')).toBe(
        'my-project-dev-env-kv',
      );
    });

    it('should handle spaces', () => {
      expect(buildKeyVaultName('my project', 'dev env')).toBe(
        'myproject-devenv-kv',
      );
    });
  });

  describe('Length constraints', () => {
    it('should handle names exactly 24 characters', () => {
      const result = buildKeyVaultName('exactlyright', 'dev');
      expect(result).toBe('exactlyright-dev-kv');
      expect(result.length).toBe(19);
    });

    it('should truncate long names keeping -kv suffix', () => {
      const result = buildKeyVaultName('verylongprojectname', 'development');
      expect(result).toBe('verylongprojectname-d-kv');
      expect(result.length).toBe(24);
    });

    it('should truncate extremely long names', () => {
      const result = buildKeyVaultName(
        'extremelylongprojectnamethatexceedslimit',
        'production',
      );
      expect(result).toBe('extremelylongprojectn-kv');
      expect(result.length).toBe(24);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty project name', () => {
      expect(buildKeyVaultName('', 'dev')).toBe('-dev-kv');
    });

    it('should handle empty environment', () => {
      expect(buildKeyVaultName('project', '')).toBe('project--kv');
    });

    it('should handle both empty', () => {
      expect(buildKeyVaultName('', '')).toBe('--kv');
    });

    it('should handle numeric project names', () => {
      expect(buildKeyVaultName('123project', 'dev')).toBe('123project-dev-kv');
    });

    it('should handle all special characters', () => {
      expect(buildKeyVaultName('!@#$%^&*()', 'dev')).toBe('-dev-kv');
    });
  });
});
