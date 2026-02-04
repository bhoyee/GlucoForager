const logs = [];
const listeners = new Set();
const MAX_LOGS = 200;

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      // Ignore listener errors.
    }
  });
};

export const addDebugLog = (entry) => {
  const timestamp = new Date().toISOString();
  const item = typeof entry === 'string'
    ? { message: entry }
    : { ...entry };
  logs.unshift({ timestamp, ...item });
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  notify();
};

export const getDebugLogs = () => [...logs];

export const clearDebugLogs = () => {
  logs.length = 0;
  notify();
};

export const subscribeDebugLogs = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
