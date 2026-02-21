import { describe, it, expect, rs, beforeEach } from '@rstest/core';

// Mock dependencies
rs.mock('./load-azure-credentials', { mock: true });
rs.mock('./create-azure-client', { mock: true });
rs.mock('./remove-secret', { mock: true });
rs.mock('./transform-secret-name-for-azure', { mock: true });

import { removeSecretByName } from './remove-secret-by-name';
import { loadAzureCredentials } from './load-azure-credentials';
import { createAzureClient } from './create-azure-client';
import { removeSecret } from './remove-secret';
import { transformSecretNameForAzure } from './transform-secret-name-for-azure';

describe('removeSecretByName', () => {
  beforeEach(() => {
    rs.clearAllMocks();

    const mockCredentials = {
      tenantId: 'test-tenant',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      subscriptionId: 'test-sub',
      location: 'eastus',
    };

    rs.mocked(loadAzureCredentials).mockReturnValue(mockCredentials);
    rs.mocked(createAzureClient).mockReturnValue(
      {} as ReturnType<typeof createAzureClient>,
    );
    rs.mocked(removeSecret).mockResolvedValue(undefined);
    rs.mocked(transformSecretNameForAzure).mockImplementation((name) =>
      name.replace(/_/g, '-'),
    );
  });

  it('should remove secret successfully', async () => {
    const result = await removeSecretByName(
      '/project',
      'dev',
      'myproject',
      'DATABASE_URL',
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(loadAzureCredentials).toHaveBeenCalledWith('/project', 'dev');
    expect(createAzureClient).toHaveBeenCalled();
    expect(removeSecret).toHaveBeenCalled();
  });

  it('should transform secret name for Azure format', async () => {
    await removeSecretByName('/project', 'dev', 'myproject', 'API_SECRET_KEY');

    expect(transformSecretNameForAzure).toHaveBeenCalledWith('API_SECRET_KEY');
    expect(removeSecret).toHaveBeenCalledWith(
      expect.anything(),
      'API-SECRET-KEY',
    );
  });

  it('should return error when credentials loading fails', async () => {
    rs.mocked(loadAzureCredentials).mockImplementation(() => {
      throw new Error('Credentials not found');
    });

    const result = await removeSecretByName(
      '/project',
      'dev',
      'myproject',
      'KEY',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Credentials not found');
  });

  it('should return error when secret removal fails', async () => {
    rs.mocked(removeSecret).mockRejectedValue(new Error('Permission denied'));

    const result = await removeSecretByName(
      '/project',
      'dev',
      'myproject',
      'KEY',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Permission denied');
  });

  it('should handle non-Error exceptions', async () => {
    rs.mocked(removeSecret).mockRejectedValue('string error');

    const result = await removeSecretByName(
      '/project',
      'dev',
      'myproject',
      'KEY',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });
});
