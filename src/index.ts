/**
 * cli-cloud-secrets - Cloud Secrets Plugin for tsdevstack CLI
 *
 * This package provides cloud secrets management commands for GCP, AWS, and Azure.
 * It is loaded by cli-core as a bundled plugin.
 *
 * Usage in cli.ts:
 *   import { initContext, registerCloudPlugin } from '@tsdevstack/cli-cloud-secrets';
 *   initContext(pluginContext);
 *   registerCloudPlugin(program);
 */

// Context initialization - must be called before registerCloudPlugin
export { initContext } from './context';

// Command registration
export { registerCloudPlugin } from './register-commands';