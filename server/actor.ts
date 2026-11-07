import { AsyncLocalStorage } from 'node:async_hooks';

/** Persona autenticada que realiza la operación en curso; se adjunta al registro de actividad. */
export type Actor = { id: string; name: string };
export const actorStore = new AsyncLocalStorage<Actor>();
export function currentActor(): Actor {
  return actorStore.getStore() ?? { id: '', name: 'Sistema' };
}
