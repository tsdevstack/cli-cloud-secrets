import { describe, it, expect, rs } from '@rstest/core';
import { setSecret } from './set-secret';
import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import * as secretExistsModule from './secret-exists';

rs.mock('./secret-exists', { mock: true });

describe('setSecret', () => {
  it('should create new secret when it does not exist', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValueOnce({}), // CreateSecretCommand
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'myapp',
      'myapp-shared-DATABASE_URL',
      'postgresql://localhost:5432/db',
    );

    expect(result).toEqual({ success: true, isNew: true });
    expect(mockClient.send).toHaveBeenCalledTimes(1);

    // Verify CreateSecretCommand was called with correct parameters
    const createCall = rs.mocked(mockClient.send).mock.calls[0][0];
    expect(createCall.input).toMatchObject({
      Name: 'myapp-shared-DATABASE_URL',
      SecretString: 'postgresql://localhost:5432/db',
      Tags: [
        { Key: 'project-name', Value: 'myapp' },
        { Key: 'managed-by', Value: 'tsdevstack' },
        { Key: 'secret-type', Value: 'user' },
      ],
    });
  });

  it('should update existing secret without creating', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValueOnce({}), // PutSecretValueCommand
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(true);

    const result = await setSecret(
      mockClient,
      'testapp',
      'testapp-shared-API_KEY',
      'secret-value-123',
    );

    expect(result).toEqual({ success: true, isNew: false });
    expect(mockClient.send).toHaveBeenCalledTimes(1);

    // Verify PutSecretValueCommand was called
    const putCall = rs.mocked(mockClient.send).mock.calls[0][0];
    expect(putCall.input).toMatchObject({
      SecretId: 'testapp-shared-API_KEY',
      SecretString: 'secret-value-123',
    });
  });

  it('should return error result when CreateSecretCommand fails', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue(new Error('Permission denied')),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(mockClient, 'app', 'secret-name', 'value');

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'Permission denied',
    });
  });

  it('should return error result when PutSecretValueCommand fails', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(true);

    const result = await setSecret(mockClient, 'app', 'secret-name', 'value');

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'Network error',
    });
  });

  it('should handle non-Error exceptions', async () => {
    const mockClient = {
      send: rs.fn().mockRejectedValue('String error'),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(mockClient, 'app', 'secret', 'value');

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'String error',
    });
  });

  it('should handle UTF-8 values correctly', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValue({}),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'app',
      'secret',
      'Hello 世界 🌍',
    );

    expect(result).toEqual({ success: true, isNew: true });
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });

  it('should apply correct tags when creating secret', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValue({}),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'my-project-name',
      'secret',
      'val',
    );

    expect(result).toEqual({ success: true, isNew: true });
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });

  it('should handle secrets with special characters', async () => {
    const mockClient = {
      send: rs.fn().mockResolvedValue({}),
    } as unknown as SecretsManagerClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const specialValue = 'password!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const result = await setSecret(mockClient, 'app', 'secret', specialValue);

    expect(result).toEqual({ success: true, isNew: true });
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });
});
