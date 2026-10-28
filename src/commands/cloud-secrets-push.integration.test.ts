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
import { createGCPClient } from '../utils/gcp/client-factory';
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

    it('should not push secrets only local development uses', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          STORAGE_ENDPOINT: 'http://localhost:9000',
          STORAGE_ACCESS_KEY: 'local-access',
          STORAGE_SECRET_KEY: 'local-secret',
          STORAGE_FORCE_PATH_STYLE: 'true',
          STORAGE_BUCKET_UPLOADS: 'uploads',
          DB_AUTH_USERNAME: 'auth',
          DB_AUTH_PASSWORD: 'db-password',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'dev' });

      const pushed = rs.mocked(cloudSecretsSet).mock.calls.map(([key]) => key);
      expect(pushed).toContain('STORAGE_BUCKET_UPLOADS');
      // infra:deploy reads the database passwords on GCP
      expect(pushed).toContain('DB_AUTH_PASSWORD');
      expect(pushed).not.toContain('STORAGE_ENDPOINT');
      expect(pushed).not.toContain('STORAGE_ACCESS_KEY');
      expect(pushed).not.toContain('STORAGE_SECRET_KEY');
      expect(pushed).not.toContain('STORAGE_FORCE_PATH_STYLE');
      expect(pushed).not.toContain('DB_AUTH_USERNAME');
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

    it('should push LOG_LEVEL as info, not the local debug', async () => {
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: { LOG_LEVEL: 'debug' },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'dev' });

      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'LOG_LEVEL',
        undefined,
        expect.objectContaining({ value: 'info', env: 'dev' }),
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
        .mockRejectedValueOnce(
          new Error('Permission denied\nAction: setSecret'),
        ) // SECRET_2
        .mockResolvedValue(undefined); // all remaining

      await expect(cloudSecretsPush({ env: 'dev' })).rejects.toThrow(
        'process.exit',
      );

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(mocks.logger.error).toHaveBeenCalledWith('   Failed: 1');
      // Each failed key with the first line of its error, then the first error in full
      expect(mocks.logger.error).toHaveBeenCalledWith(
        '      SECRET_2: Permission denied',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Permission denied\nAction: setSecret',
      );
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

    it("should prompt for a backend service's own secret and push it to that service's scope", async () => {
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {},
        'api-service': { STRIPE_API_KEY: 'sk_test_local', secrets: [] },
      } as unknown as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ value: 'sk_live' });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'STRIPE_API_KEY (api-service)',
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'STRIPE_API_KEY',
        undefined,
        expect.objectContaining({
          value: 'sk_live',
          env: 'prod',
          service: 'api-service',
        }),
      );
    });

    it('should name values in a frontend section, which nothing reads in the cloud', async () => {
      mocks.loadFrameworkConfig.mockReturnValue({
        ...mockConfig,
        services: [
          ...mockConfig.services,
          { name: 'frontend', type: 'nextjs', port: 3000 },
        ],
      } as unknown as ReturnType<typeof mocks.loadFrameworkConfig>);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {},
        frontend: { ANALYTICS_ID: 'GA-1' },
      } as unknown as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Not pushed: ANALYTICS_ID in the "frontend" section',
        ),
      );
      expect(inquirer.prompt).not.toHaveBeenCalled();
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

    it('should prompt for ADMIN_EMAILS and push it to the auth-service scope when set locally', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.buildSecretName.mockImplementation(
        (project: string, scope: string, key: string) =>
          `${project}-${scope}-${key}`,
      );
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          EMAIL_FROM: 'noreply@example.com',
          ADMIN_EMAILS: 'me@example.com',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt)
        .mockResolvedValueOnce({ value: 'noreply@prod.com' })
        .mockResolvedValueOnce({ value: ' admin@prod.com ' });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
      expect(mocks.buildSecretName).toHaveBeenCalledWith(
        'test-project',
        'auth-service',
        'ADMIN_EMAILS',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promoted to ADMIN'),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        undefined,
        expect.objectContaining({
          value: 'admin@prod.com',
          env: 'prod',
          service: 'auth-service',
        }),
      );
    });

    it('should not prompt for ADMIN_EMAILS when it is empty locally, and print the set command', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { EMAIL_FROM: 'noreply@example.com', ADMIN_EMAILS: '  ' },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({
        value: 'noreply@prod.com',
      });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        undefined,
        expect.anything(),
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'cloud-secrets:set ADMIN_EMAILS --service auth-service --env prod',
        ),
      );
    });

    it('should not prompt for ADMIN_EMAILS when the user file lacks it', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { EMAIL_FROM: 'noreply@example.com' },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({
        value: 'noreply@prod.com',
      });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(mocks.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'cloud-secrets:set ADMIN_EMAILS --service auth-service',
        ),
      );
    });

    it('should let the developer skip the ADMIN_EMAILS prompt', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { ADMIN_EMAILS: 'me@example.com' },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({ value: '' });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        undefined,
        expect.anything(),
      );
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Skipped ADMIN_EMAILS (set later with: cloud-secrets:set ADMIN_EMAILS --service auth-service',
        ),
      );
    });

    it('should ignore ADMIN_EMAILS without the auth template', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          EMAIL_FROM: 'noreply@example.com',
          ADMIN_EMAILS: 'me@example.com',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(inquirer.prompt).mockResolvedValueOnce({
        value: 'noreply@prod.com',
      });
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod' });

      expect(inquirer.prompt).toHaveBeenCalledTimes(1);
      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'ADMIN_EMAILS',
        undefined,
        expect.anything(),
      );
    });

    it('should not prompt with --skip-user-secrets and print how to set ADMIN_EMAILS', async () => {
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { EMAIL_FROM: 'noreply@example.com' },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      mocks.buildSecretName.mockReturnValue('test-project-shared-DOMAIN');
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod', skipUserSecrets: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'cloud-secrets:set ADMIN_EMAILS --service auth-service --env prod',
        ),
      );
    });

    it('should list user secrets missing in the cloud with --skip-user-secrets', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: {
          DOMAIN: 'localhost',
          RESEND_API_KEY: 're_local',
          EMAIL_FROM: 'noreply@example.com',
          API_URL: 'http://localhost:8000',
          KONG_SERVICE_HOST: 'host.docker.internal',
          ADMIN_EMAILS: 'me@example.com',
        },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod', skipUserSecrets: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'User secrets not set in prod: DOMAIN, RESEND_API_KEY, EMAIL_FROM',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '  npx tsdevstack cloud-secrets:set RESEND_API_KEY --env prod',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Then run this command again to derive API_URL, APP_URL, KONG_CORS_ORIGINS',
      );
      expect(mocks.logger.info).not.toHaveBeenCalledWith(
        '  npx tsdevstack cloud-secrets:set API_URL --env prod',
      );
    });

    it("should list a service's own missing secret with --service in --skip-user-secrets mode", async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { RESEND_API_KEY: 're_local' },
        'api-service': { STRIPE_API_KEY: 'sk_test_local' },
      } as unknown as ReturnType<typeof mocks.loadUserSecrets>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod', skipUserSecrets: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'User secrets not set in prod: RESEND_API_KEY, STRIPE_API_KEY (api-service)',
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '  npx tsdevstack cloud-secrets:set STRIPE_API_KEY --service api-service --env prod',
      );
    });

    it('should derive from DOMAIN and report all user secrets set with --skip-user-secrets', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);
      mocks.loadUserSecrets.mockReturnValue({
        secrets: { DOMAIN: 'localhost', RESEND_API_KEY: 're_local' },
      } as ReturnType<typeof mocks.loadUserSecrets>);
      mocks.buildSecretName.mockImplementation(
        (project: string, scope: string, key: string) =>
          `${project}-${scope}-${key}`,
      );
      rs.mocked(createGCPClient).mockReturnValue({
        getSecret: rs.fn().mockResolvedValue([{}]),
        accessSecretVersion: rs
          .fn()
          .mockResolvedValue([{ payload: { data: Buffer.from('shop.com') } }]),
      } as unknown as ReturnType<typeof createGCPClient>);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod', skipUserSecrets: true });

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'API_URL',
        undefined,
        expect.objectContaining({ value: 'https://api.shop.com', env: 'prod' }),
      );
      expect(mocks.logger.success).toHaveBeenCalledWith(
        'All user secrets from .secrets.user.json are set in prod',
      );
    });

    it('should fall back to general instructions with --skip-user-secrets and no local user secrets', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);
      mocks.loadUserSecrets.mockReturnValue(null);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);

      await cloudSecretsPush({ env: 'prod', skipUserSecrets: true });

      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Other user secrets must be set manually before first deployment:',
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

  describe('Auth secrets scope', () => {
    // A GCP project holding these secret IDs (names without the project path)
    const gcpClientWith = (stored: Record<string, string>) =>
      ({
        getSecret: rs.fn(async ({ name }: { name: string }) => {
          const id = name.split('/secrets/')[1];
          if (!(id in stored)) {
            throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
          }
          return [{ name }];
        }),
        accessSecretVersion: rs.fn(async ({ name }: { name: string }) => {
          const id = name.split('/secrets/')[1].split('/versions/')[0];
          if (!(id in stored)) {
            throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
          }
          return [{ payload: { data: Buffer.from(stored[id]) } }];
        }),
      }) as unknown as ReturnType<typeof createGCPClient>;

    beforeEach(() => {
      mocks.findProjectRoot.mockReturnValue(mockProjectRoot);
      mocks.loadFrameworkConfig.mockReturnValue(
        mockConfig as ReturnType<typeof mocks.loadFrameworkConfig>,
      );
      mocks.hasAuthTemplate.mockReturnValue(true);
      mocks.loadCredentialsFile.mockReturnValue({
        prod: { project_id: 'gcp-prod' },
      });
      mocks.buildSecretName.mockImplementation(
        (project: string, scope: string, key: string) =>
          `${project}-${scope}-${key}`,
      );
      mocks.generateFrameworkSecretsFile.mockReturnValue({
        secrets: {
          KONG_TRUST_TOKEN: 'trust-token',
          JWT_PRIVATE_KEY_CURRENT: 'generated-key',
          REFRESH_TOKEN_SECRET: 'generated-refresh',
        },
      } as ReturnType<typeof mocks.generateFrameworkSecretsFile>);
      mocks.loadUserSecrets.mockReturnValue(null);
      rs.mocked(cloudSecretsSet).mockResolvedValue(undefined);
    });

    it('should push the auth secrets to the auth-service scope in a new environment', async () => {
      rs.mocked(createGCPClient).mockReturnValue(gcpClientWith({}));

      await cloudSecretsPush({ env: 'prod' });

      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        undefined,
        expect.objectContaining({
          value: 'generated-key',
          service: 'auth-service',
          overwrite: false,
        }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'KONG_TRUST_TOKEN',
        undefined,
        expect.not.objectContaining({ service: expect.anything() }),
      );
    });

    it('should keep the value an existing environment holds in shared', async () => {
      rs.mocked(createGCPClient).mockReturnValue(
        gcpClientWith({
          'test-project-shared-JWT_PRIVATE_KEY_CURRENT': 'existing-key',
          'test-project-shared-REFRESH_TOKEN_SECRET': 'existing-refresh',
        }),
      );

      await cloudSecretsPush({ env: 'prod' });

      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        undefined,
        expect.objectContaining({
          value: 'existing-key',
          service: 'auth-service',
        }),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'REFRESH_TOKEN_SECRET',
        undefined,
        expect.objectContaining({
          value: 'existing-refresh',
          service: 'auth-service',
        }),
      );
      expect(mocks.logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'JWT_PRIVATE_KEY_CURRENT (auth-service, value kept from shared)',
        ),
      );
    });

    it('should not write an auth secret its scope already holds', async () => {
      rs.mocked(createGCPClient).mockReturnValue(
        gcpClientWith({
          'test-project-auth-service-JWT_PRIVATE_KEY_CURRENT': 'current-key',
          'test-project-auth-service-REFRESH_TOKEN_SECRET': 'current-refresh',
        }),
      );

      await cloudSecretsPush({ env: 'prod' });

      expect(cloudSecretsSet).not.toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        expect.anything(),
        expect.anything(),
      );
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'KONG_TRUST_TOKEN',
        undefined,
        expect.anything(),
      );
    });

    it('should push every framework secret to shared without the auth template', async () => {
      mocks.hasAuthTemplate.mockReturnValue(false);

      await cloudSecretsPush({ env: 'prod' });

      expect(createGCPClient).not.toHaveBeenCalled();
      expect(cloudSecretsSet).toHaveBeenCalledWith(
        'JWT_PRIVATE_KEY_CURRENT',
        undefined,
        expect.not.objectContaining({ service: expect.anything() }),
      );
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
