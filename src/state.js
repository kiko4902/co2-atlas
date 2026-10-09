// @ts-check

/**
 * @typedef {import("./types.js").AppState} AppState
 * @typedef {(state: AppState, changed: Set<keyof AppState>, previous: AppState) => void} Listener
 */

/**
 * A minimal store: one state object, shallow patches, and listeners that receive
 * the set of keys that actually changed so each view can skip unrelated work.
 * @param {AppState} initial
 */
export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  /** @type {Set<Listener>} */
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    /** @param {Partial<AppState>} patch */
    set(patch) {
      /** @type {Set<keyof AppState>} */
      const changed = new Set();
      for (const key of /** @type {(keyof AppState)[]} */ (Object.keys(patch))) {
        if (!Object.is(state[key], patch[key])) changed.add(key);
      }
      if (changed.size === 0) return;
      const previous = state;
      state = Object.freeze({ ...state, ...patch });
      for (const listener of listeners) listener(state, changed, previous);
    },
    /** @param {Listener} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
