import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { SecretClient } from '@azure/keyvault-secrets';
import { setSecret, transformKeyForAzure } from './set-secret';

// Mock the secretExists function
rs.mock('./secret-exists', { mock: true });
import { secretExists } from './secret-exists';

describe('transformKeyForAzure', () => {
  it('should replace underscores with hyphens', () => {
    expect(transformKeyForAzure('DATABASE_URL')).toBe('DATABASE-URL');
    expect(transformKeyForAzure('API_KEY')).toBe('API-KEY');
    expect(transformKeyForAzure('JWT_SECRET_KEY')).toBe('JWT-SECRET-KEY');
  });

  it('should handle keys without underscores', () => {
    expect(transformKeyForAzure('apikey')).toBe('apikey');
    expect(transformKeyForAzure('database-url')).toBe('database-url');
  });
});

describe('setSecret', () => {
  let mockClient: SecretClient;
  let mockSetSecret: ReturnType<typeof rs.fn>;

  beforeEach(() => {
    rs.clearAllMocks();
    mockSetSecret = rs.fn();
    mockClient = {
      setSecret: mockSetSecret,
    } as unknown as SecretClient;
  });

  describe('Standard use cases', () => {
    it('should set a new secret successfully', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(false);
      mockSetSecret.mockResolvedValueOnce({});

      const result = await setSecret(
        mockClient,
        'test-secret',
        'secret-value',
        { 'project-name': 'test', environment: 'dev' },
      );

      expect(result).toEqual({
        success: true,
        isNew: true,
      });
      expect(secretExists).toHaveBeenCalledWith(mockClient, 'test-secret');
      expect(mockSetSecret).toHaveBeenCalledWith(
        'test-secret',
        'secret-value',
        {
          tags: { 'project-name': 'test', environment: 'dev' },
        },
      );
    });

    it('should update an existing secret', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(true);
      mockSetSecret.mockResolvedValueOnce({});

      const result = await setSecret(
        mockClient,
        'existing-secret',
        'new-value',
        { 'project-name': 'test' },
      );

      expect(result).toEqual({
        success: true,
        isNew: false,
      });
    });

    it('should handle empty tags', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(false);
      mockSetSecret.mockResolvedValueOnce({});

      const result = await setSecret(mockClient, 'test-secret', 'value', {});

      expect(result).toEqual({
        success: true,
        isNew: true,
      });
      expect(mockSetSecret).toHaveBeenCalledWith('test-secret', 'value', {
        tags: {},
      });
    });
  });

  describe('Tag validation', () => {
    it('should accept exactly 15 tags', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(false);
      mockSetSecret.mockResolvedValueOnce({});

      const tags: Record<string, string> = {};
      for (let i = 1; i <= 15; i++) {
        tags[`tag${i}`] = `value${i}`;
      }

      const result = await setSecret(mockClient, 'test', 'value', tags);

      expect(result).toEqual({
        success: true,
        isNew: true,
      });
    });

    it('should reject more than 15 tags', async () => {
      // Setup mock for secretExists that will be called first
      rs.mocked(secretExists).mockResolvedValueOnce(false);

      const tags: Record<string, string> = {};
      for (let i = 1; i <= 16; i++) {
        tags[`tag${i}`] = `value${i}`;
      }

      const result = await setSecret(mockClient, 'test', 'value', tags);

      expect(result).toEqual({
        success: false,
        isNew: false,
        error: 'Azure Key Vault supports maximum 15 tags (provided: 16)',
      });
      // secretExists is called before tag validation in the actual implementation
      expect(secretExists).toHaveBeenCalledWith(mockClient, 'test');
      expect(mockSetSecret).not.toHaveBeenCalled();
    });

    it('should reject way too many tags', async () => {
      // Setup mock for secretExists that will be called first
      rs.mocked(secretExists).mockResolvedValueOnce(false);

      const tags: Record<string, string> = {};
      for (let i = 1; i <= 50; i++) {
        tags[`tag${i}`] = `value${i}`;
      }

      const result = await setSecret(mockClient, 'test', 'value', tags);

      expect(result).toEqual({
        success: false,
        isNew: false,
        error: 'Azure Key Vault supports maximum 15 tags (provided: 50)',
      });
      expect(secretExists).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle errors from secretExists', async () => {
      rs.mocked(secretExists).mockRejectedValueOnce(new Error('Network error'));

      const result = await setSecret(mockClient, 'test-secret', 'value', {});

      expect(result).toEqual({
        success: false,
        isNew: false,
        error: 'Network error',
      });
    });

    it('should handle errors from setSecret', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(false);
      mockSetSecret.mockRejectedValueOnce(new Error('Access denied'));

      const result = await setSecret(mockClient, 'test-secret', 'value', {});

      expect(result).toEqual({
        success: false,
        isNew: false,
        error: 'Access denied',
      });
    });

    it('should handle non-Error objects', async () => {
      rs.mocked(secretExists).mockResolvedValueOnce(false);
      mockSetSecret.mockRejectedValueOnce('String error');

      const result = await setSecret(mockClient, 'test-secret', 'value', {});

      expect(result).toEqual({
        success: false,
        isNew: false,
        error: 'Unknown error',
      });
    });
  });
});
