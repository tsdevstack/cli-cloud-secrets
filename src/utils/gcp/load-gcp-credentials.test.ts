import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../../test-utils/mock-context';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

// Mock context using the shared mocks
rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

import { loadGCPCredentials } from './load-gcp-credentials';

describe('loadGCPCredentials', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('should load GCP credentials for specific environment', () => {
    const mockCredentials = {
      dev: {
        project_id: 'dev-project',
        client_email: 'dev@example.com',
        private_key: 'dev-key',
      },
      prod: {
        project_id: 'prod-project',
        client_email: 'prod@example.com',
        private_key: 'prod-key',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadGCPCredentials('/root', 'dev');

    expect(result).toEqual(mockCredentials.dev);
    expect(mocks.loadCredentialsFile).toHaveBeenCalledWith('/root', 'gcp');
  });

  it('should load production environment credentials', () => {
    const mockCredentials = {
      prod: {
        project_id: 'prod-project',
        client_email: 'prod@example.com',
        private_key: 'prod-key',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadGCPCredentials('/root', 'prod');

    expect(result).toEqual(mockCredentials.prod);
  });

  it('should throw error if environment does not exist', () => {
    const mockCredentials = {
      dev: {
        project_id: 'dev-project',
        client_email: 'dev@example.com',
        private_key: 'dev-key',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    expect(() => {
      loadGCPCredentials('/root', 'nonexistent');
    }).toThrow('No credentials found for environment "nonexistent"');
  });

  it('should include environment name in error message', () => {
    mocks.loadCredentialsFile.mockReturnValue({});

    try {
      loadGCPCredentials('/root', 'staging');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('staging');
      expect((error as Error).message).toContain('.credentials.gcp.json');
    }
  });

  it('should handle credentials file with only one environment', () => {
    const mockCredentials = {
      prod: {
        project_id: 'prod-only',
        client_email: 'prod@example.com',
        private_key: 'key',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadGCPCredentials('/root', 'prod');

    expect(result.project_id).toBe('prod-only');
  });
});
