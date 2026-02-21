import { describe, it, expect, rs } from '@rstest/core';
import { secretExists } from './secret-exists';
import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';

describe('secretExists', () => {
  it('should return true when secret exists', async () => {
    const mockClient = {
      getSecret: rs.fn().mockResolvedValue({ name: 'test-secret' }),
    } as unknown as SecretManagerServiceClient;

    const result = await secretExists(
      mockClient,
      'test-project',
      'test-secret',
    );

    expect(result).toBe(true);
    expect(mockClient.getSecret).toHaveBeenCalledWith({
      name: 'projects/test-project/secrets/test-secret',
    });
  });

  it('should return false when secret does not exist', async () => {
    const mockClient = {
      getSecret: rs.fn().mockRejectedValue(new Error('Not found')),
    } as unknown as SecretManagerServiceClient;

    const result = await secretExists(
      mockClient,
      'test-project',
      'missing-secret',
    );

    expect(result).toBe(false);
    expect(mockClient.getSecret).toHaveBeenCalledWith({
      name: 'projects/test-project/secrets/missing-secret',
    });
  });

  it('should return false on any error', async () => {
    const mockClient = {
      getSecret: rs.fn().mockRejectedValue(new Error('Permission denied')),
    } as unknown as SecretManagerServiceClient;

    const result = await secretExists(mockClient, 'test-project', 'secret');

    expect(result).toBe(false);
  });

  it('should handle different project IDs', async () => {
    const mockClient = {
      getSecret: rs.fn().mockResolvedValue({ name: 'secret' }),
    } as unknown as SecretManagerServiceClient;

    await secretExists(mockClient, 'another-project-123', 'my-secret');

    expect(mockClient.getSecret).toHaveBeenCalledWith({
      name: 'projects/another-project-123/secrets/my-secret',
    });
  });

  it('should handle different secret IDs', async () => {
    const mockClient = {
      getSecret: rs.fn().mockResolvedValue({ name: 'secret' }),
    } as unknown as SecretManagerServiceClient;

    await secretExists(mockClient, 'proj', 'DATABASE_URL');

    expect(mockClient.getSecret).toHaveBeenCalledWith({
      name: 'projects/proj/secrets/DATABASE_URL',
    });
  });
});
