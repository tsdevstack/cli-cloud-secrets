/**
 * Read standard input
 */

import { readFileSync } from 'node:fs';

/**
 * Read all of standard input, exactly as given (a trailing newline is kept,
 * so pipe with printf rather than echo). Used for secret values, which on
 * the command line would show in the process list.
 *
 * @returns Standard input as UTF-8 text
 */
export function readStdin(): string {
  return readFileSync(0, 'utf-8');
}
