import { describe, it, expect } from '@rstest/core';
import { listUnreadUserSecretSections } from './list-unread-user-secret-sections';
import type { FrameworkConfig, SecretsFile } from '@tsdevstack/cli/plugin';

const config = {
  project: { name: 'shop' },
  services: [
    { name: 'auth-service', type: 'nestjs' },
    { name: 'auth-worker', type: 'worker', baseService: 'auth-service' },
    { name: 'frontend', type: 'nextjs' },
  ],
} as unknown as FrameworkConfig;

describe('listUnreadUserSecretSections', () => {
  describe('Standard use cases', () => {
    it('should name values in frontend, worker and unknown sections', () => {
      const file = {
        secrets: { SENTRY_DSN: 'dsn' },
        'auth-service': { TWILIO_ACCOUNT_SID: 'AC1' },
        frontend: { ANALYTICS_ID: 'GA-1', secrets: ['SENTRY_DSN'] },
        'auth-worker': { QUEUE_TOKEN: 't' },
        'old-service': { KEY: 'v' },
      } as unknown as SecretsFile;

      const sections = listUnreadUserSecretSections(file, config);

      expect(sections.map(({ section, keys }) => ({ section, keys }))).toEqual([
        { section: 'frontend', keys: ['ANALYTICS_ID'] },
        { section: 'auth-worker', keys: ['QUEUE_TOKEN'] },
        { section: 'old-service', keys: ['KEY'] },
      ]);
      expect(sections[1].reason).toContain("auth-service's section");
      expect(sections[2].reason).toBe(
        'no service with this name in config.json',
      );
    });
  });

  describe('Edge cases', () => {
    it('should ignore a frontend section with only its secrets array', () => {
      const file = {
        frontend: { secrets: ['SENTRY_DSN'] },
      } as unknown as SecretsFile;

      expect(listUnreadUserSecretSections(file, config)).toEqual([]);
    });
  });
});
