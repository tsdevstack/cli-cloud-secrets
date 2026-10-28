import { describe, it, expect, rs, beforeEach, afterEach } from '@rstest/core';
import type { PluginContext } from '@tsdevstack/cli/plugin';
import type { MockContext } from '../test-utils/mock-context';

// Get mocks from globalThis (set by test-setup.js)
const mocks = (globalThis as unknown as { contextMocks: MockContext })
  .contextMocks;

// Mock context using shared mocks
rs.mock('../context', () => ({
  initContext: rs.fn(),
  getContext: rs.fn(
    () =>
      (globalThis as unknown as { contextMocks: PluginContext }).contextMocks,
  ),
  wrapCommand: rs.fn((fn: unknown) => fn),
}));

import { cloudSecretsGet } from './cloud-secrets-get';

rs.mock('inquirer', { mock: true });
rs.mock('../utils/gcp/load-gcp-credentials', { mock: true });
rs.mock('../utils/gcp/client-factory', { mock: true });
rs.mock('../utils/gcp/get-secret', { mock: true });
rs.mock('../utils/azure/load-azure-credentials', { mock: true });
rs.mock('../utils/azure/create-azure-client', { mock: true });
rs.mock('../utils/azure/get-secret', { mock: true });

import { loadGCPCredentials } from '../utils/gcp/load-gcp-credentials';
import { createGCPClient } from '../utils/gcp/client-factory';
import { getSecret as getGCPSecret } from '../utils/gcp/get-secret';
import { loadAzureCredentials } from '../utils/azure/load-azure-credentials';
import { createAzureClient } from '../utils/azure/create-azure-client';
import { getSecret as getAzureSecret } from '../utils/azure/get-secret';

describe('cloudSecretsGet', () => {
  const mockProjectRoot = '/test/project';
  const mockConfig = {
    project: { name: 'test-project', version: '1.0.0' },
    cloud: { provider: 'gcp' as const },
    services: [],
  };

  let processExitSpy: ReturnType<
    typeof rs.spyOn<[code?: number | string | null | undefined], never>
  >;
  let consoleLogSpy: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    rs.resetAllMocks();
    processExitSpy = rs.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit');
    });
    consoleLogSpy = rs.spyOn(console, 'log').mockImplementation(() => {});

    mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
    mocks.loadFrameworkConfig.mockReturnValue(
      mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
    );
    mocks.buildSecretName.mockImplementation(
      (project: string, scope: string, key: string) =>
        `${project}-${scope}-${key}`,
    );
    rs.mocked(loadGCPCredentials).mockReturnValue({
      project_id: 'gcp-dev',
    } as ReturnType<typeof loadGCPCredentials>);
    rs.mocked(createGCPClient).mockReturnValue(
      {} as ReturnType<typeof createGCPClient>,
    );
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('Input validation', () => {
    it('should exit without a key', async () => {
      await expect(cloudSecretsGet(undefined, { env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith('Secret key is required');
    });
  });

  describe('Scope', () => {
    it('should read a shared secret by default', async () => {
      rs.mocked(getGCPSecret).mockResolvedValue('trust-token');

      await expect(
        cloudSecretsGet('KONG_TRUST_TOKEN', { env: 'dev' }),
      ).resolves.toBe('trust-token');

      expect(getGCPSecret).toHaveBeenCalledWith(
        {},
        'projects/gcp-dev/secrets/test-project-shared-KONG_TRUST_TOKEN',
      );
    });

    it("should read an auth secret from the auth-service's scope by default", async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      rs.mocked(getGCPSecret).mockResolvedValue('admin@shop.test');

      await cloudSecretsGet('ADMIN_EMAILS', { env: 'dev' });

      expect(getGCPSecret).toHaveBeenCalledWith(
        {},
        'projects/gcp-dev/secrets/test-project-auth-service-ADMIN_EMAILS',
      );
    });

    it('should read the scope --service names', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      rs.mocked(getGCPSecret).mockResolvedValue('old-key');

      await cloudSecretsGet('JWT_PRIVATE_KEY_CURRENT', {
        env: 'dev',
        service: 'shared',
      });

      expect(getGCPSecret).toHaveBeenCalledWith(
        {},
        'projects/gcp-dev/secrets/test-project-shared-JWT_PRIVATE_KEY_CURRENT',
      );
    });
  });

  describe('Azure service vaults', () => {
    beforeEach(() => {
      mocks.loadFrameworkConfig.mockReturnValue({
        ...mockConfig,
        cloud: { provider: 'azure' },
      } as unknown as ReturnType<typeof mocks.loadFrameworkConfig>);
      mocks.hasAuthTemplate.mockReturnValue(true);
      rs.mocked(loadAzureCredentials).mockReturnValue(
        {} as ReturnType<typeof loadAzureCredentials>,
      );
      rs.mocked(createAzureClient).mockReturnValue(
        {} as ReturnType<typeof createAzureClient>,
      );
    });

    it("should read an auth secret from the auth-service's vault", async () => {
      mocks.keyVaultExists.mockResolvedValue(true);
      rs.mocked(getAzureSecret).mockResolvedValue('admin@shop.test');

      await expect(
        cloudSecretsGet('ADMIN_EMAILS', { env: 'dev' }),
      ).resolves.toBe('admin@shop.test');
      expect(createAzureClient).toHaveBeenCalledWith(
        {},
        'test-project',
        'dev',
        'auth-service',
      );
    });

    it("should report not found when the service's vault does not exist", async () => {
      mocks.keyVaultExists.mockResolvedValue(false);

      await expect(
        cloudSecretsGet('ADMIN_EMAILS', { env: 'dev' }),
      ).rejects.toThrow('process.exit');

      expect(getAzureSecret).not.toHaveBeenCalled();
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Secret 'ADMIN_EMAILS' not found in dev",
      );
    });
  });

  describe('Output', () => {
    it('should print the value as JSON with --json', async () => {
      rs.mocked(getGCPSecret).mockResolvedValue('value');

      await cloudSecretsGet('DOMAIN', { env: 'dev', json: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        JSON.stringify({ key: 'DOMAIN', value: 'value' }),
      );
    });

    it('should exit when the secret does not exist', async () => {
      rs.mocked(getGCPSecret).mockResolvedValue(null);

      await expect(cloudSecretsGet('MISSING', { env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Secret 'MISSING' not found in dev",
      );
    });
  });
});
