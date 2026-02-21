/**
 * Rstest setup file - runs before all tests
 *
 * Creates shared mocks on globalThis so test files can access them
 */

import { createMockContext } from './src/test-utils/mock-context.js';

// Create mocks once and put on globalThis
globalThis.contextMocks = createMockContext();