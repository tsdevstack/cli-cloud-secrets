import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { PluginContext } from 'tsdevstack/plugin';
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

import { loadAWSCredentials } from './load-aws-credentials';

describe('loadAWSCredentials', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('should load AWS credentials for specific environment', () => {
    const mockCredentials = {
      dev: {
        accountId: '123456789012',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      },
      prod: {
        accountId: '234567890123',
        accessKeyId: 'AKIAPROD12345EXAMPLE',
        secretAccessKey: 'prodSecretKeyExample123456789',
        region: 'us-west-2',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadAWSCredentials('/root', 'dev');

    expect(result).toEqual(mockCredentials.dev);
    expect(mocks.loadCredentialsFile).toHaveBeenCalledWith('/root', 'aws');
  });

  it('should load production environment credentials', () => {
    const mockCredentials = {
      prod: {
        accountId: '234567890123',
        accessKeyId: 'AKIAPROD12345EXAMPLE',
        secretAccessKey: 'prodSecretKeyExample123456789',
        region: 'us-west-2',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadAWSCredentials('/root', 'prod');

    expect(result).toEqual(mockCredentials.prod);
  });

  it('should throw CliError if environment does not exist', () => {
    const mockCredentials = {
      dev: {
        accountId: '123456789012',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    expect(() => {
      loadAWSCredentials('/root', 'nonexistent');
    }).toThrow('No credentials found for environment "nonexistent"');
  });

  it('should include environment name in error message', () => {
    mocks.loadCredentialsFile.mockReturnValue({});

    try {
      loadAWSCredentials('/root', 'staging');
      expect.fail('Should have thrown CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('CliError');
      expect((error as Error).message).toContain('staging');
      expect((error as Error).message).toContain('.credentials.aws.json');
    }
  });

  it('should include hint about cloud:init in error', () => {
    mocks.loadCredentialsFile.mockReturnValue({});

    try {
      loadAWSCredentials('/root', 'staging');
      expect.fail('Should have thrown CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('CliError');
      const cliError = error as Error & { hint?: string };
      expect(cliError.hint).toContain('cloud:init');
      expect(cliError.hint).toContain('--aws');
    }
  });

  it('should handle credentials file with only one environment', () => {
    const mockCredentials = {
      prod: {
        accountId: '345678901234',
        accessKeyId: 'AKIAPROD12345EXAMPLE',
        secretAccessKey: 'prodSecretKeyExample123456789',
        region: 'eu-west-1',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const result = loadAWSCredentials('/root', 'prod');

    expect(result.accessKeyId).toBe('AKIAPROD12345EXAMPLE');
    expect(result.region).toBe('eu-west-1');
  });

  it('should handle different AWS regions', () => {
    const mockCredentials = {
      'us-east': {
        accountId: '123456789012',
        accessKeyId: 'AKIAEAST123456789012',
        secretAccessKey: 'eastSecretKey',
        region: 'us-east-1',
      },
      'eu-west': {
        accountId: '234567890123',
        accessKeyId: 'AKIAWEST123456789012',
        secretAccessKey: 'westSecretKey',
        region: 'eu-west-1',
      },
    };

    mocks.loadCredentialsFile.mockReturnValue(mockCredentials);

    const usEast = loadAWSCredentials('/root', 'us-east');
    expect(usEast.region).toBe('us-east-1');

    const euWest = loadAWSCredentials('/root', 'eu-west');
    expect(euWest.region).toBe('eu-west-1');
  });
});
