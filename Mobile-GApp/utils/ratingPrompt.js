// utils/ratingPrompt.js
// Ask happy users for a store rating - at the right moment, rarely, and never twice in a row.
//
// Screens call recordPositiveMoment() after something good (a reading on target, a recipe
// saved, cooking finished, the day's challenge done). That only counts the moment. The prompt
// itself appears later, calmly, when Home comes into focus (maybeShowRatingPrompt), so it never
// lands on top of a screen's own success alert.
//
// The first question is ours ("Enjoying GlucoForager?"): "Yes" goes to the store's rating sheet,
// "Not really" opens a private feedback box, so unhappy users talk to us instead of the store.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const STORAGE_KEY = 'ratingPrompt:v1';
export const RATING_PROMPT_EVENT = 'ratingPrompt:show';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RULES = {
  minDaysSinceFirstUse: 3,
  minMomentsSincePrompt: 3,
  maxPrompts: 3,
  daysBetweenPrompts: 120,
  daysAfterNotReally: 180,
};

const APP_STORE_REVIEW_URL = 'https://apps.apple.com/us/app/glucoforager/id6758808427?action=write-review';
const PLAY_STORE_URL = 'market://details?id=com.glucoforager.app';
const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.glucoforager.app';

let shownThisSession = false;

const readState = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const state = raw ? JSON.parse(raw) : {};
    if (!state.firstSeenAt) state.firstSeenAt = Date.now();
    return {
      firstSeenAt: state.firstSeenAt,
      moments: Number(state.moments) || 0,
      prompts: Number(state.prompts) || 0,
      lastPromptAt: state.lastPromptAt || null,
      notReallyAt: state.notReallyAt || null,
      rated: Boolean(state.rated),
    };
  } catch {
    return { firstSeenAt: Date.now(), moments: 0, prompts: 0, lastPromptAt: null, notReallyAt: null, rated: false };
  }
};

const writeState = async (state) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not worth surfacing: worst case the prompt shows a little earlier or later.
  }
};

// Pure check, exported for tests.
export const isEligible = (state, now = Date.now()) => {
  if (state.rated || state.prompts >= RULES.maxPrompts) return false;
  if (now - state.firstSeenAt < RULES.minDaysSinceFirstUse * DAY_MS) return false;
  if (state.moments < RULES.minMomentsSincePrompt) return false;
  if (state.lastPromptAt && now - state.lastPromptAt < RULES.daysBetweenPrompts * DAY_MS) return false;
  if (state.notReallyAt && now - state.notReallyAt < RULES.daysAfterNotReally * DAY_MS) return false;
  return true;
};

export const recordPositiveMoment = async () => {
  const state = await readState();
  state.moments += 1;
  await writeState(state);
};

// Call when Home gains focus. Shows the prompt (via the global RatingPrompt) when due.
export const maybeShowRatingPrompt = async ({ delayMs = 900 } = {}) => {
  if (shownThisSession) return false;
  const state = await readState();
  await writeState(state); // persists firstSeenAt on the very first call
  if (!isEligible(state)) return false;
  shownThisSession = true;
  state.prompts += 1;
  state.lastPromptAt = Date.now();
  state.moments = 0;
  await writeState(state);
  setTimeout(() => DeviceEventEmitter.emit(RATING_PROMPT_EVENT), delayMs);
  return true;
};

export const markRated = async () => {
  const state = await readState();
  state.rated = true;
  await writeState(state);
};

export const markNotReally = async () => {
  const state = await readState();
  state.notReallyAt = Date.now();
  await writeState(state);
};

const openStoreListing = async () => {
  const primary = Platform.OS === 'ios' ? APP_STORE_REVIEW_URL : PLAY_STORE_URL;
  const fallback = Platform.OS === 'ios' ? APP_STORE_REVIEW_URL : PLAY_STORE_WEB_URL;
  try {
    await Linking.openURL(primary);
  } catch {
    try {
      await Linking.openURL(fallback);
    } catch {
      // Nothing else to try.
    }
  }
};

// The native in-app rating sheet when this build has it (from app 1.0.12), otherwise the
// store page. Builds without the native module must never even load expo-store-review,
// because loading it throws there - hence the optional lookup first.
export const requestStoreReview = async () => {
  try {
    if (requireOptionalNativeModule('ExpoStoreReview')) {
      const StoreReview = require('expo-store-review');
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        return;
      }
    }
  } catch {
    // Fall through to the store page.
  }
  await openStoreListing();
};
