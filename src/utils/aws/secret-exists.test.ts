import { describe, it, expect, rs } from '@rstest/core';
import { secretExists } from './secret-exists';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

describe('secretExists', () => {
  it('should return true when secret exists', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValue({
        Name: 'myapp-shared-DATABASE_URL',
        ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp-shared-DATABASE_URL',
      }),
    } as unknown as SecretsManagerClient;

    const result = await secretExists(mockClient, 'myapp-shared-DATABASE_URL');

    expect(result).toBe(true);
    expect(mockClient.send).toHaveBeenCalledTimes(1);

    // Verify DescribeSecretCommand was called with correct SecretId
    const describeCall = rs.mocked(mockClient.send).mock.calls[0][0];
    expect(describeCall.input).toEqual({
      SecretId: 'myapp-shared-DATABASE_URL',
    });
  });

  it('should return false when secret does not exist', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue(new Error('ResourceNotFoundException')),
    } as unknown as SecretsManagerClient;

    const result = await secretExists(mockClient, 'nonexistent-secret');

    expect(result).toBe(false);
  });

  it('should return false for access denied errors', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue(new Error('AccessDeniedException')),
    } as unknown as SecretsManagerClient;

    const result = await secretExists(mockClient, 'secret');

    expect(result).toBe(false);
  });

  it('should return false for any error', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue(new Error('Some AWS error')),
    } as unknown as SecretsManagerClient;

    const result = await secretExists(mockClient, 'test-secret');

    expect(result).toBe(false);
  });

  it('should check multiple secrets independently', async () => {
    const mockClient = {
      send: rs
        .fn()
        .mockResolvedValueOnce({ Name: 'secret-1' }) // exists
        .mockRejectedValueOnce(new Error('Not found')) // doesn't exist
        .mockResolvedValueOnce({ Name: 'secret-3' }), // exists
    } as unknown as SecretsManagerClient;

    const result1 = await secretExists(mockClient, 'secret-1');
    const result2 = await secretExists(mockClient, 'secret-2');
    const result3 = await secretExists(mockClient, 'secret-3');

    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(result3).toBe(true);
    expect(mockClient.send).toHaveBeenCalledTimes(3);
  });
});
