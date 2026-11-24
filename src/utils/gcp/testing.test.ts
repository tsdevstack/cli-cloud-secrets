import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from '../../test-utils/mock-context';

const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../../context', () => ({
  getContext: rs.fn(
    () => (globalThis as unknown as { contextMocks: MockContext }).contextMocks,
  ),
}));

const mockListSecrets = rs.fn();
rs.mock('./client-factory', () => ({
  createGCPClient: rs.fn(() => ({ listSecrets: mockListSecrets })),
}));

import { testAllGCPEnvironments } from './testing';

describe('testAllGCPEnvironments', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mocks.loadCredentialsFile.mockReturnValue({
      dev: { project_id: 'shop-dev' },
      prod: { project_id: 'shop-prod' },
    });
    mockListSecrets.mockResolvedValue([[]]);
  });

  describe('Standard use cases', () => {
    it('should test every environment of the credentials file', async () => {
      const results = await testAllGCPEnvironments('/project');

      expect(results).toEqual([
        { env: 'dev', valid: true, projectId: 'shop-dev' },
        { env: 'prod', valid: true, projectId: 'shop-prod' },
      ]);
    });

    it('should call only the one environment it is given', async () => {
      const results = await testAllGCPEnvironments('/project', 'prod');

      expect(results).toEqual([
        { env: 'prod', valid: true, projectId: 'shop-prod' },
      ]);
      expect(mockListSecrets).toHaveBeenCalledTimes(1);
      expect(mockListSecrets).toHaveBeenCalledWith({
        parent: 'projects/shop-prod',
      });
    });
  });

  describe('Edge cases', () => {
    it('should report a failed connection', async () => {
      mockListSecrets.mockRejectedValue(new Error('PERMISSION_DENIED'));

      const results = await testAllGCPEnvironments('/project', 'dev');

      expect(results).toEqual([
        { env: 'dev', valid: false, error: 'PERMISSION_DENIED' },
      ]);
    });
  });
});
