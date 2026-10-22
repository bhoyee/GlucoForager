// Tells App.js when Home has its first data, so the branded splash can stay up until then
// instead of handing over to a blank "Loading..." screen.
let homeReady = false;
const listeners = new Set();

export function markHomeReady() {
  if (homeReady) return;
  homeReady = true;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore listener errors.
    }
  });
  listeners.clear();
}

// Calls `fn` once Home is ready (immediately if it already is). Returns an unsubscribe function.
export function onHomeReady(fn) {
  if (homeReady) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}
