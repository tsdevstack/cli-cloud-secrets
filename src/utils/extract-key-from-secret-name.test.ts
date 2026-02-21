import { describe, it, expect } from '@rstest/core';
import { extractKeyFromSecretName } from './extract-key-from-secret-name';

describe('extractKeyFromSecretName', () => {
  it('should extract key from valid secret name', () => {
    const result = extractKeyFromSecretName(
      'tsdevstack-shared-DATABASE_URL',
      'tsdevstack',
    );

    expect(result).toBe('DATABASE_URL');
  });

  it('should return null if secret name does not match prefix', () => {
    const result = extractKeyFromSecretName(
      'wrongproject-shared-DATABASE_URL',
      'tsdevstack',
    );

    expect(result).toBe(null);
  });

  it('should return null if secret name is missing shared scope', () => {
    const result = extractKeyFromSecretName(
      'tsdevstack-staging-DATABASE_URL',
      'tsdevstack',
    );

    expect(result).toBe(null);
  });

  it('should handle keys with multiple underscores', () => {
    const result = extractKeyFromSecretName(
      'myproject-shared-MY_COMPLEX_SECRET_KEY',
      'myproject',
    );

    expect(result).toBe('MY_COMPLEX_SECRET_KEY');
  });

  it('should handle empty key part', () => {
    const result = extractKeyFromSecretName('myproject-shared-', 'myproject');

    expect(result).toBe('');
  });

  it('should return null for completely wrong format', () => {
    const result = extractKeyFromSecretName('just-a-random-name', 'myproject');

    expect(result).toBe(null);
  });

  it('should be case sensitive for project name', () => {
    const result = extractKeyFromSecretName(
      'MyProject-shared-KEY',
      'myproject',
    );

    expect(result).toBe(null);
  });
});
