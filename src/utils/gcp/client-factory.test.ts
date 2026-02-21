import { describe, it, expect, rs, beforeEach } from '@rstest/core';
import type { MockContext } from '../../test-utils/mock-context';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

rs.mock('../../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () => (globalThis as unknown as { contextMocks: MockContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

// Define mock class INSIDE the factory to avoid hoisting issues
rs.mock('@google-cloud/secret-manager', () => {
  return {
    SecretManagerServiceClient: class {
      options: unknown;
      constructor(options: unknown) {
        this.options = options;
      }
    },
  };
});

import { createGCPClient } from './client-factory';

describe('createGCPClient', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('should create client with credentials options', () => {
    const mockOptions = {
      credentials: {
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: 'test-key',
      },
      projectId: 'test-project',
    };
    mocks.buildGCPClientOptions.mockReturnValue(mockOptions);

    const credentials = {
      project_id: 'test-project',
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: 'test-key',
      region: 'us-central1',
    };

    const client = createGCPClient(credentials);

    expect(mocks.buildGCPClientOptions).toHaveBeenCalledWith(credentials);
    expect(client).toBeDefined();
    // Verify client was created with the options from buildGCPClientOptions
    expect((client as unknown as { options: unknown }).options).toEqual(
      mockOptions,
    );
  });

  it('should create client for ADC mode (no private_key)', () => {
    const mockOptions = {
      projectId: 'ci-project',
    };
    mocks.buildGCPClientOptions.mockReturnValue(mockOptions);

    const credentials = {
      project_id: 'ci-project',
      client_email: 'ci@project.iam.gserviceaccount.com',
      region: 'us-central1',
    };

    const client = createGCPClient(credentials);

    expect(mocks.buildGCPClientOptions).toHaveBeenCalledWith(credentials);
    expect(client).toBeDefined();
    expect((client as unknown as { options: unknown }).options).toEqual(
      mockOptions,
    );
  });

  it('should pass through buildGCPClientOptions result to client', () => {
    const customOptions = {
      credentials: { client_email: 'custom@test.com', private_key: 'key' },
      projectId: 'custom-project',
      fallback: true,
    };
    mocks.buildGCPClientOptions.mockReturnValue(customOptions);

    const client = createGCPClient({
      project_id: 'any',
      client_email: 'any@test.com',
      region: 'us-central1',
    });

    expect((client as unknown as { options: unknown }).options).toEqual(
      customOptions,
    );
  });
});
