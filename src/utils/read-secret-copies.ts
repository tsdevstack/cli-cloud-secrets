/**
 * Read both copies of moved secrets
 */

import type {
  OldSecretStore,
  SecretCopies,
  SecretMove,
  SecretStoreReader,
} from './types';

/**
 * Read the old and the new copy of each moved secret. A move without an old
 * copy has nothing left to move and is left out.
 *
 * @param moves - Where old copies may be (listSecretMoves)
 * @param oldStore - The old copies' store
 * @param store - The environment's secret store, for the new copies
 * @returns Both values of each old copy found, in the order of the moves
 */
export async function readSecretCopies(
  moves: SecretMove[],
  oldStore: OldSecretStore,
  store: SecretStoreReader,
): Promise<SecretCopies[]> {
  const copies = await Promise.all(
    moves.map(async (move): Promise<SecretCopies | null> => {
      const oldValue = await oldStore.read(move.key, move.oldScope);
      if (oldValue === null) {
        return null;
      }
      const newValue = await store.read(move.key, move.scope);
      return { move, oldValue, newValue };
    }),
  );
  return copies.filter((copy): copy is SecretCopies => copy !== null);
}
