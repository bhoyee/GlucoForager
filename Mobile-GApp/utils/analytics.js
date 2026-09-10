// utils/analytics.js
// Thin wrapper around the PostHog client so any screen can fire an event with a
// plain function call, without needing the usePostHog() hook everywhere. Screen
// views and app open/background are captured automatically by <PostHogProvider>
// in App.js - this module is only for the specific interaction events we choose
// to track (see each call site for what/why).
import { PostHog } from 'posthog-react-native';

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
// Must match the region the PostHog project actually lives in (check the
// dashboard URL: eu.posthog.com vs us.posthog.com) - a mismatch doesn't error,
// it just silently accepts events into a region the project can't see.
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

// null when no API key is configured (e.g. local dev without analytics set up) -
// every helper below no-ops safely in that case rather than throwing.
export const posthog = API_KEY ? new PostHog(API_KEY, { host: HOST }) : null;

export function trackEvent(name, properties) {
  if (!posthog) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // Analytics must never break the app it's measuring.
  }
}

export function identifyUser(userId, properties) {
  if (!posthog || !userId) return;
  try {
    posthog.identify(String(userId), properties);
  } catch {
    // Ignore.
  }
}

export function resetAnalyticsIdentity() {
  if (!posthog) return;
  try {
    posthog.reset();
  } catch {
    // Ignore.
  }
}
