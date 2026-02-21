import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { SecretClient } from '@azure/keyvault-secrets';
import { removeSecret } from './remove-secret';

describe('removeSecret', () => {
  let mockClient: SecretClient;
  let mockBeginDeleteSecret: ReturnType<typeof rs.fn>;
  let mockPoller: {
    pollUntilDone: ReturnType<typeof rs.fn>;
  };

  beforeEach(() => {
    rs.clearAllMocks();

    mockPoller = {
      pollUntilDone: rs.fn().mockResolvedValue({}),
    };

    mockBeginDeleteSecret = rs.fn().mockResolvedValue(mockPoller);

    mockClient = {
      beginDeleteSecret: mockBeginDeleteSecret,
    } as unknown as SecretClient;
  });

  describe('Standard use cases', () => {
    it('should delete a secret successfully', async () => {
      await removeSecret(mockClient, 'test-secret');

      expect(mockBeginDeleteSecret).toHaveBeenCalledTimes(1);
      expect(mockBeginDeleteSecret).toHaveBeenCalledWith('test-secret');
      expect(mockPoller.pollUntilDone).toHaveBeenCalledTimes(1);
    });

    it('should handle secrets with complex names', async () => {
      const secretName = 'my-project-shared-DATABASE-URL';

      await removeSecret(mockClient, secretName);

      expect(mockBeginDeleteSecret).toHaveBeenCalledWith(secretName);
    });

    it('should wait for deletion to complete', async () => {
      // Mock a polling operation without actual timer delay for reliable testing
      let pollUntilDoneCalledAt: number | null = null;
      const slowPoller = {
        pollUntilDone: rs.fn().mockImplementation(async () => {
          pollUntilDoneCalledAt = Date.now();
          // Simulate async work without actual delay
          await Promise.resolve();
          return {};
        }),
      };
      mockBeginDeleteSecret.mockResolvedValueOnce(slowPoller);

      await removeSecret(mockClient, 'slow-delete');

      // Verify that pollUntilDone was called
      expect(slowPoller.pollUntilDone).toHaveBeenCalledTimes(1);
      expect(pollUntilDoneCalledAt).not.toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from beginDeleteSecret', async () => {
      const error = new Error('Secret not found');
      mockBeginDeleteSecret.mockRejectedValueOnce(error);

      await expect(removeSecret(mockClient, 'non-existent')).rejects.toThrow(
        'Secret not found',
      );
    });

    it('should propagate errors from pollUntilDone', async () => {
      const errorPoller = {
        pollUntilDone: rs.fn().mockRejectedValue(new Error('Polling failed')),
      };
      mockBeginDeleteSecret.mockResolvedValueOnce(errorPoller);

      await expect(removeSecret(mockClient, 'polling-error')).rejects.toThrow(
        'Polling failed',
      );
    });

    it('should handle access denied errors', async () => {
      const error = new Error('Access denied');
      mockBeginDeleteSecret.mockRejectedValueOnce(error);

      await expect(
        removeSecret(mockClient, 'unauthorized-secret'),
      ).rejects.toThrow('Access denied');
    });
  });
});
