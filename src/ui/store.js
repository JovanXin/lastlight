// Minimal observable store. No framework, no dependencies.

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    get() { return state; },
    set(patch) {
      state = typeof patch === "function" ? patch(state) : Object.assign({}, state, patch);
      listeners.forEach(function (fn) { fn(state); });
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },
  };
}
