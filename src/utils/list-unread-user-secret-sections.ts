/**
 * List the sections of .secrets.user.json whose values no service reads in
 * the cloud
 */

import type { FrameworkConfig, SecretsFile } from '@tsdevstack/cli/plugin';

/** A section with values that cloud-secrets:push does not send anywhere */
export interface UnreadUserSecretSection {
  section: string;
  keys: string[];
  /** Why no service reads them in the cloud */
  reason: string;
}

/**
 * Values (not the `secrets` array) in sections that are not backend
 * services. Locally they reach the app, but in the cloud nothing reads them:
 * a worker reads its base service's scope, a frontend gets the shared keys
 * listed in its `secrets` array, and a section without a service is unused.
 *
 * @param userSecretsFile - Parsed .secrets.user.json
 * @param config - Framework config
 * @returns The sections with values, and why they are not pushed
 */
export function listUnreadUserSecretSections(
  userSecretsFile: SecretsFile,
  config: FrameworkConfig,
): UnreadUserSecretSection[] {
  const servicesByName = new Map(
    config.services.map((service) => [service.name, service]),
  );

  const sections: UnreadUserSecretSection[] = [];
  for (const [section, content] of Object.entries(userSecretsFile)) {
    if (
      section === 'secrets' ||
      section.startsWith('$') ||
      !content ||
      typeof content !== 'object' ||
      Array.isArray(content)
    ) {
      continue;
    }
    const service = servicesByName.get(section);
    if (service?.type === 'nestjs') {
      continue;
    }
    const keys = Object.entries(content)
      .filter(
        ([key, value]) =>
          typeof value === 'string' &&
          key !== 'secrets' &&
          !key.startsWith('$'),
      )
      .map(([key]) => key);
    if (keys.length === 0) {
      continue;
    }

    let reason = 'no service with this name in config.json';
    if (service?.type === 'worker') {
      reason = `a worker reads its base service's scope: put them in ${service.baseService ?? 'its base service'}'s section`;
    } else if (service) {
      reason =
        'a frontend gets the shared keys listed in its secrets array: put the values in the top-level secrets object and list the keys in the array';
    }
    sections.push({ section, keys, reason });
  }
  return sections;
}
