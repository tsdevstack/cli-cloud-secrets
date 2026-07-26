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

import { cloudSecretsPush } from './cloud-secrets-push';

// Mock all dependencies
rs.mock('inquirer', { mock: true });
rs.mock('./cloud-secrets-set', { mock: true });
rs.mock('../utils/gcp/client-factory', () => ({
  createGCPClient: rs.fn(() => ({})),
}));
rs.mock('../utils/aws/client-factory', () => ({
  createAWSClient: rs.fn(() => ({})),
}));
rs.mock('../utils/azure/client-factory', () => ({
  createAzureClient: rs.fn(() => ({})),
}));

import inquirer from 'inquirer';
import { cloudSecretsSet } from './cloud-secrets-set';
describe('cloudSecretsPush', () => {
  const mockProjectRoot = '/test/project';
  const mockConfig = {
    project: { name: 'test-project', version: '1.0.0' },
    cloud: { provider: 'gcp' as const },
    services: [
      { name: 'auth-service', type: 'nestjs' as const, port: 3001 },
      { name: 'api-service', type: 'nestjs' as const, port: 3002 },
    ],
  };

  let processExitSpy: ReturnType<
    typeof rs.spyOn<[code?: number | string | null | undefined], never>
  >;

  beforeEach(() => {
    rs.resetAllMocks();
    processExitSpy = rs.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  describe('Input validation', () => {
    it('should exit if project root not found', async () => {
      mocks.findProjectRoot.mockReturnValue('');

      await expect(cloudSecretsPush({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Could not find project root (.tsdevstack/config.json)',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if provider not configured', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue({
        project: { name: 'test-project', version: '1.0.0' },
        cloud: { provider: null },
        services: [],
      });

      await expect(cloudSecretsPush({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Cloud provider not configured in config.json',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit if no environments found', async () => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue([]);

      await expect(cloudSecretsPush({})).rejects.toThrow('process.exit');

      expect(mocks.logger.error).toHaveBeenCalledWith(
        'No environments found in credentials file!',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Environment selection', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
    });

    it('should prompt for environment if not provided', async () => {
      mocks.getAvailableEnvironments.mockReturnValue([
        'dev',
        'staging',
        'prod',
      ]);
      rs.mocked(inquirer.prompt).mockResolvedValue({ env: 'staging' });
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: { KONG_ADMIN_KEY: 'test-key' },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      mocks.loadUserSecrets.mockReturnValue(null);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({});

      expect(inquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'select',
          name: 'env',
          message: 'Select environment to push secrets to:',
          choices: ['dev', 'staging', 'prod'],
        }),
      ]);
    });

    it('should use provided environment', async () => {
      mocks.getAvailableEnvironments.mockReturnValue(['dev', 'staging']);
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: { KONG_ADMIN_KEY: 'test-key' },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      mocks.loadUserSecrets.mockReturnValue(null);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'staging' });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith('Environment: STAGING');
    });
  });

  describe('Framework secrets push', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.loadUserSecrets.mockReturnValue(null);
    });

    it('should generate fresh framework secrets', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          KONG_ADMIN_KEY: 'fresh-key-123',
          AUTH_SECRET: 'fresh-secret-456',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'dev' });

      expect(mocks.generateFrameworkSecretsFile).toHaveBeenCalledWith(
        mockConfig,
        null,
      );
      // Service URLs are NOT generated here - they're synced after deployment via infra:service-deploy
    });

    it('should filter out metadata, non-string values, REDIS_*, and *_URL keys', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          $comment: 'metadata',
          KONG_ADMIN_KEY: 'test-key',
          NODE_ENV: 'production',
          SECRETS_PROVIDER: 'gcp',
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
          AUTH_SERVICE_URL: 'http://localhost:3001',
          VALID_SECRET: 'valid-value',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'dev' });

      // Should push KONG_ADMIN_KEY, VALID_SECRET + KONG_SSL_VERIFY + TTLs + EMAIL_PROVIDER
      // (not metadata, NODE_ENV, SECRETS_PROVIDER, REDIS_*, or *_URL)
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'KONG_ADMIN_KEY',
        undefined,
        expect.objectContaining({
          value: 'test-key',
          env: 'dev',
          overwrite: false,
          internal: true,
        }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'VALID_SECRET',
        undefined,
        expect.objectContaining({
          value: 'valid-value',
          env: 'dev',
        }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'KONG_SSL_VERIFY',
        undefined,
        expect.objectContaining({
          value: 'yes',
          env: 'dev',
        }),
      );
      // TTLs and EMAIL_PROVIDER are added as framework defaults
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'ACCESS_TOKEN_TTL',
        undefined,
        expect.objectContaining({ value: '900' }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'EMAIL_PROVIDER',
        undefined,
        expect.objectContaining({ value: 'resend' }),
      );
      // REDIS_HOST should NOT be pushed (synced by deploy)
      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'REDIS_HOST',
        undefined,
        expect.any(Object),
      );
      // AUTH_SERVICE_URL should NOT be pushed (set after deployment)
      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'AUTH_SERVICE_URL',
        undefined,
        expect.any(Object),
      );
    });

    it('should push framework secrets in parallel', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value-1',
          SECRET_2: 'value-2',
          SECRET_3: 'value-3',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'dev' });

      // 8 calls: 3 secrets + KONG_SSL_VERIFY + 3 TTLs + EMAIL_PROVIDER
      expect(cloudSecretsSet).toHaveBeenCalledTimes(8);
    });

    it('should exit with error when framework push has failures', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          SECRET_1: 'value-1',
          SECRET_2: 'value-2',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      // 7 calls total: SECRET_1, SECRET_2, KONG_SSL_VERIFY, 3 TTLs, EMAIL_PROVIDER
      // Second call fails, rest succeed
      rs.mocked(cloudSecretsSet)
        .mockResolvedValueOnce(undefined) // SECRET_1
        .mockRejectedValueOnce(new Error('Permission denied')) // SECRET_2
        .mockResolvedValue(undefined); // all remaining

      await expect(cloudSecretsPush({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(mocks.logger.error).toHaveBeenCalledWith('   Failed: 1');
    });
  });

  describe('User secrets push', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['prod']);
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {},
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      // Mock credentials for GCP (needed when user secrets exist to create client)
      mocks.loadCredentialsFile.mockReturnValue({
        prod: {
          project_id: 'test-project-prod',
          region: 'us-central1',
        },
      });
    });

    it('should prompt for each promptable user secret', async () => {
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          RESEND_API_KEY: 're_test_key',
          EMAIL_FROM: 'noreply@example.com',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ value: 'prod-resend-key' })
        .mockResolvedValueOnce({ value: 'noreply@prod.com' });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      // 2 prompts for the 2 user secrets (no DOMAIN in this test)
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'RESEND_API_KEY',
        undefined,
        expect.objectContaining({
          value: 'prod-resend-key',
          env: 'prod',
        }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'EMAIL_FROM',
        undefined,
        expect.objectContaining({
          value: 'noreply@prod.com',
          env: 'prod',
        }),
      );
    });

    it('should skip auto-managed keys (local-only, TTLs, domain-derived)', async () => {
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          KONG_SERVICE_HOST: 'host.docker.internal',
          ACCESS_TOKEN_TTL: '900',
          API_URL: 'http://localhost:8000',
          EMAIL_FROM: 'noreply@example.com',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({
        value: 'noreply@prod.com',
      });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      // Only EMAIL_FROM should be prompted (1 prompt)
      // KONG_SERVICE_HOST: local-only, ACCESS_TOKEN_TTL: framework default, API_URL: domain-derived
      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      // Framework secrets (KONG_SSL_VERIFY + TTLs + EMAIL_PROVIDER) + EMAIL_FROM
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'EMAIL_FROM',
        undefined,
        expect.objectContaining({
          value: 'noreply@prod.com',
          env: 'prod',
        }),
      );
    });

    it('should allow skipping user secrets', async () => {
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          RESEND_API_KEY: 'value-1',
          EMAIL_FROM: 'value-2',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ value: 'new-value-1' })
        .mockResolvedValueOnce({ value: '' }); // Skip second secret
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      // Framework secrets + RESEND_API_KEY (user, EMAIL_FROM was skipped)
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'RESEND_API_KEY',
        undefined,
        expect.any(Object),
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipped EMAIL_FROM'),
      );
    });

    it('should handle user secret push failures', async () => {
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          RESEND_API_KEY: 'value-1',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ value: 'new-value' });
      // Framework secrets succeed, RESEND_API_KEY fails
      rs.mocked(cloudSecretsSet).mockImplementation(async (key) => {
        if (key === 'RESEND_API_KEY') {
          throw new Error('Network error');
        }
      });

      await cloudSecretsPush({ env: 'prod' });

      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed: Network error'),
      );
    });

    it('should handle no user secrets', async () => {
      mocks.loadUserSecrets.mockReturnValue(null);
      // Framework secrets are still pushed (KONG_SSL_VERIFY + TTLs + EMAIL_PROVIDER)
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(mocks.logger.info).toHaveBeenCalledWith('No user secrets to push');
    });
  });

  describe('Summary', () => {
    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.getAvailableEnvironments.mockReturnValue(['dev']);
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: { KONG_ADMIN_KEY: 'test' },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      mocks.loadUserSecrets.mockReturnValue(null);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);
    });

    it('should show completion message and next steps', async () => {
      await cloudSecretsPush({ env: 'dev' });

      expect(mocks.logger.complete).toHaveBeenCalledWith(
        'Secrets push complete!',
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith('Next steps:');
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '1. Verify secrets in cloud provider console',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '2. Deploy infrastructure: npx tsdevstack infra:deploy --env dev',
      );
    });
  });
});
