import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { SecretClient } from '@azure/keyvault-secrets';
import { listSecrets } from './list-secrets';

describe('listSecrets', () => {
  let mockClient: SecretClient;
  let mockListPropertiesOfSecrets: ReturnType<typeof rs.fn>;
  let mockGetSecret: ReturnType<typeof rs.fn>;

  beforeEach(() => {
    rs.clearAllMocks();
    mockGetSecret = rs.fn();
    mockListPropertiesOfSecrets = rs.fn();

    mockClient = {
      listPropertiesOfSecrets: mockListPropertiesOfSecrets,
      getSecret: mockGetSecret,
    } as unknown as SecretClient;
  });

  describe('Standard use cases', () => {
    it('should list secrets filtered by project name', async () => {
      const mockProperties = [
        { name: 'secret1', tags: { 'project-name': 'test-project' } },
        { name: 'secret2', tags: { 'project-name': 'other-project' } },
        { name: 'secret3', tags: { 'project-name': 'test-project' } },
      ];

      // Mock the async iterator
      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const prop of mockProperties) {
            yield prop;
          }
        },
      });

      mockGetSecret
        .mockResolvedValueOnce({ value: 'value1', name: 'secret1' })
        .mockResolvedValueOnce({ value: 'value3', name: 'secret3' });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual({
        secret1: 'value1',
        secret3: 'value3',
      });
      expect(mockGetSecret).toHaveBeenCalledTimes(2);
      expect(mockGetSecret).toHaveBeenCalledWith('secret1');
      expect(mockGetSecret).toHaveBeenCalledWith('secret3');
    });

    it('should handle empty results', async () => {
      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          // Empty iterator
        },
      });

      const result = await listSecrets(mockClient, 'empty-project');

      expect(result).toEqual({});
      expect(mockGetSecret).not.toHaveBeenCalled();
    });

    it('should filter out secrets with null values', async () => {
      const mockProperties = [
        { name: 'secret1', tags: { 'project-name': 'test-project' } },
        { name: 'secret2', tags: { 'project-name': 'test-project' } },
      ];

      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const prop of mockProperties) {
            yield prop;
          }
        },
      });

      mockGetSecret
        .mockResolvedValueOnce({ value: 'value1', name: 'secret1' })
        .mockResolvedValueOnce({ value: null, name: 'secret2' });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual({
        secret1: 'value1',
      });
    });
  });

  describe('Tag filtering', () => {
    it('should ignore secrets without tags', async () => {
      const mockProperties = [
        { name: 'secret1', tags: { 'project-name': 'test-project' } },
        { name: 'secret2' }, // No tags
        { name: 'secret3', tags: {} }, // Empty tags
      ];

      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const prop of mockProperties) {
            yield prop;
          }
        },
      });

      mockGetSecret.mockResolvedValueOnce({ value: 'value1', name: 'secret1' });

      const result = await listSecrets(mockClient, 'test-project');

      expect(result).toEqual({
        secret1: 'value1',
      });
      expect(mockGetSecret).toHaveBeenCalledTimes(1);
    });

    it('should handle secrets with different tag values', async () => {
      const mockProperties = [
        { name: 'secret1', tags: { 'project-name': 'project-a' } },
        { name: 'secret2', tags: { 'project-name': 'project-b' } },
        { name: 'secret3', tags: { 'project-name': 'project-a' } },
      ];

      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const prop of mockProperties) {
            yield prop;
          }
        },
      });

      mockGetSecret
        .mockResolvedValueOnce({ value: 'value1', name: 'secret1' })
        .mockResolvedValueOnce({ value: 'value3', name: 'secret3' });

      const result = await listSecrets(mockClient, 'project-a');

      expect(result).toEqual({
        secret1: 'value1',
        secret3: 'value3',
      });
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from listPropertiesOfSecrets', async () => {
      mockListPropertiesOfSecrets.mockReturnValue({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              throw new Error('Failed to list secrets');
            },
          };
        },
      });

      await expect(listSecrets(mockClient, 'error-project')).rejects.toThrow(
        'Failed to list secrets',
      );
    });

    it('should propagate errors from getSecret', async () => {
      const mockProperties = [
        { name: 'secret1', tags: { 'project-name': 'test-project' } },
      ];

      mockListPropertiesOfSecrets.mockReturnValue({
        async *[Symbol.asyncIterator]() {
          for (const prop of mockProperties) {
            yield prop;
          }
        },
      });

      mockGetSecret.mockRejectedValueOnce(new Error('Access denied'));

      await expect(listSecrets(mockClient, 'test-project')).rejects.toThrow(
        'Access denied',
      );
    });
  });
});
