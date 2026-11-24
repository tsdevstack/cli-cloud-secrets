import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from '../../test-utils/mock-context';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../../context', () => ({
  getContext: rs.fn(
    () => (globalThis as unknown as { contextMocks: MockContext }).contextMocks,
  ),
}));

const mockStsSend = rs.fn();
rs.mock('@aws-sdk/client-sts', () => ({
  STSClient: class {
    send = mockStsSend;
  },
  GetCallerIdentityCommand: class {},
}));
const mockSecretsSend = rs.fn();
rs.mock('./client-factory', () => ({
  createAWSClient: rs.fn(() => ({ send: mockSecretsSend })),
}));
rs.mock('@aws-sdk/client-secrets-manager', () => ({
  ListSecretsCommand: class {},
}));

import { testAllAWSEnvironments } from './testing';

const credentials = (accountId: string) => ({
  accountId,
  accessKeyId: `key-${accountId}`,
  secretAccessKey: 'secret',
  region: 'eu-central-1',
});

describe('testAllAWSEnvironments', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mocks.loadCredentialsFile.mockReturnValue({
      dev: credentials('111111111111'),
      prod: credentials('222222222222'),
    });
    mockSecretsSend.mockResolvedValue({});
  });

  describe('Standard use cases', () => {
    it('should test every environment of the credentials file', async () => {
      mockStsSend
        .mockResolvedValueOnce({ Account: '111111111111' })
        .mockResolvedValueOnce({ Account: '222222222222' });

      const results = await testAllAWSEnvironments('/project');

      expect(results.map((result) => [result.env, result.valid])).toEqual([
        ['dev', true],
        ['prod', true],
      ]);
    });

    it('should call only the one environment it is given', async () => {
      mockStsSend.mockResolvedValue({ Account: '222222222222' });

      const results = await testAllAWSEnvironments('/project', 'prod');

      expect(results).toEqual([
        { env: 'prod', valid: true, accountId: '222222222222' },
      ]);
      expect(mockStsSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('should report credentials of another account', async () => {
      mockStsSend.mockResolvedValue({ Account: '999999999999' });

      const [result] = await testAllAWSEnvironments('/project', 'dev');

      expect(result).toMatchObject({ env: 'dev', valid: false });
      expect(result.error).toContain('Account ID mismatch');
    });
  });
});
