import { describe, it, expect, rs } from '@rstest/core';
import { setSecret } from './set-secret';
import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as secretExistsModule from './secret-exists';

rs.mock('./secret-exists', { mock: true });

describe('setSecret', () => {
  it('should create new secret when it does not exist', async () => {
    const mockClient = {
      createSecret: rs.fn().mockResolvedValue({}),
      addSecretVersion: rs.fn().mockResolvedValue({}),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'test-project-123',
      'myapp',
      'myapp-shared-DATABASE_URL',
      'postgresql://localhost:5432/db',
    );

    expect(result).toEqual({ success: true, isNew: true });
    expect(mockClient.createSecret).toHaveBeenCalledWith({
      parent: 'projects/test-project-123',
      secretId: 'myapp-shared-DATABASE_URL',
      secret: {
        replication: {
          automatic: {},
        },
        labels: {
          'project-name': 'myapp',
          'managed-by': 'tsdevstack',
          'secret-type': 'user',
        },
      },
    });
    expect(mockClient.addSecretVersion).toHaveBeenCalledWith({
      parent: 'projects/test-project-123/secrets/myapp-shared-DATABASE_URL',
      payload: {
        data: Buffer.from('postgresql://localhost:5432/db', 'utf8'),
      },
    });
  });

  it('should update existing secret without creating', async () => {
    const mockClient = {
      createSecret: rs.fn(),
      addSecretVersion: rs.fn().mockResolvedValue({}),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(true);

    const result = await setSecret(
      mockClient,
      'proj-456',
      'testapp',
      'testapp-shared-API_KEY',
      'secret-value-123',
    );

    expect(result).toEqual({ success: true, isNew: false });
    expect(mockClient.createSecret).not.toHaveBeenCalled();
    expect(mockClient.addSecretVersion).toHaveBeenCalledWith({
      parent: 'projects/proj-456/secrets/testapp-shared-API_KEY',
      payload: {
        data: Buffer.from('secret-value-123', 'utf8'),
      },
    });
  });

  it('should return error result when createSecret fails', async () => {
    const mockClient = {
      createSecret: rs.fn().mockRejectedValue(new Error('Permission denied')),
      addSecretVersion: rs.fn(),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'proj',
      'app',
      'secret-name',
      'value',
    );

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'Permission denied',
    });
  });

  it('should return error result when addSecretVersion fails', async () => {
    const mockClient = {
      createSecret: rs.fn().mockResolvedValue({}),
      addSecretVersion: rs.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'proj',
      'app',
      'secret-name',
      'value',
    );

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'Network error',
    });
  });

  it('should handle non-Error exceptions', async () => {
    const mockClient = {
      createSecret: rs.fn().mockRejectedValue('String error'),
      addSecretVersion: rs.fn(),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    const result = await setSecret(
      mockClient,
      'proj',
      'app',
      'secret',
      'value',
    );

    expect(result).toEqual({
      success: false,
      isNew: false,
      error: 'String error',
    });
  });

  it('should encode UTF-8 values correctly', async () => {
    const mockClient = {
      createSecret: rs.fn().mockResolvedValue({}),
      addSecretVersion: rs.fn().mockResolvedValue({}),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    await setSecret(mockClient, 'proj', 'app', 'secret', 'Hello 世界 🌍');

    expect(mockClient.addSecretVersion).toHaveBeenCalledWith({
      parent: 'projects/proj/secrets/secret',
      payload: {
        data: Buffer.from('Hello 世界 🌍', 'utf8'),
      },
    });
  });

  it('should apply correct labels when creating secret', async () => {
    const mockClient = {
      createSecret: rs.fn().mockResolvedValue({}),
      addSecretVersion: rs.fn().mockResolvedValue({}),
    } as unknown as SecretManagerServiceClient;

    rs.spyOn(secretExistsModule, 'secretExists').mockResolvedValue(false);

    await setSecret(mockClient, 'p', 'my-project-name', 'secret', 'val');

    expect(mockClient.createSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: expect.objectContaining({
          labels: {
            'project-name': 'my-project-name',
            'managed-by': 'tsdevstack',
            'secret-type': 'user',
          },
        }),
      }),
    );
  });
});
