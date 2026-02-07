'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const MAX_QUEUE = 50;
const FLUSH_DELAY_MS = 2000;

const toMessage = (value) => {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

export default function SystemLogger() {
  const queueRef = useRef([]);
  const flushTimer = useRef(null);

  useEffect(() => {
    const enqueue = (entry) => {
      queueRef.current.push(entry);
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current.shift();
      }
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        flush();
      }, FLUSH_DELAY_MS);
    };

    const flush = async () => {
      const events = queueRef.current.splice(0, queueRef.current.length);
      if (!events.length) return;
      const path = window.location?.pathname;
      const source = path && path.startsWith('/admin') ? 'admin' : 'landing';
      const payload = {
        events: events.map((event) => ({ ...event, source })),
        app_version: 'web',
        device: navigator.userAgent,
        path,
      };
      try {
        await fetch(`${API_URL}/api/system/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        // Swallow logging failures to avoid loops.
      }
    };

    const handleError = (event) => {
      enqueue({
        level: 'error',
        message: event.message || 'Unhandled error',
        details: event.error ? toMessage(event.error) : event.filename,
        timestamp: new Date().toISOString(),
      });
    };

    const handleRejection = (event) => {
      enqueue({
        level: 'error',
        message: 'Unhandled promise rejection',
        details: toMessage(event.reason),
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
      }
    };
  }, []);

  return null;
}
