import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { RULES, isEligible, recordPositiveMoment, maybeShowRatingPrompt, markNotReally } from '../ratingPrompt';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25);
const base = { firstSeenAt: NOW - 10 * DAY, moments: 3, prompts: 0, lastPromptAt: null, notReallyAt: null, rated: false };

describe('isEligible', () => {
  it('asks after enough happy moments once the user has had the app a few days', () => {
    expect(isEligible(base, NOW)).toBe(true);
  });

  it('waits for new users and for enough happy moments', () => {
    expect(isEligible({ ...base, firstSeenAt: NOW - 1 * DAY }, NOW)).toBe(false);
    expect(isEligible({ ...base, moments: RULES.minMomentsSincePrompt - 1 }, NOW)).toBe(false);
  });

  it('never asks again after rating, and stops after the max number of prompts', () => {
    expect(isEligible({ ...base, rated: true }, NOW)).toBe(false);
    expect(isEligible({ ...base, prompts: RULES.maxPrompts }, NOW)).toBe(false);
  });

  it('leaves long gaps between prompts and after "Not really"', () => {
    expect(isEligible({ ...base, lastPromptAt: NOW - 30 * DAY }, NOW)).toBe(false);
    expect(isEligible({ ...base, lastPromptAt: NOW - (RULES.daysBetweenPrompts + 1) * DAY }, NOW)).toBe(true);
    expect(isEligible({ ...base, notReallyAt: NOW - 60 * DAY }, NOW)).toBe(false);
  });
});

describe('prompt flow', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('shows once when due, then resets the moment count', async () => {
    await AsyncStorage.setItem('ratingPrompt:v1', JSON.stringify({ ...base, firstSeenAt: Date.now() - 10 * DAY, moments: 2 }));
    await recordPositiveMoment();
    const listener = jest.fn();
    const sub = DeviceEventEmitter.addListener('ratingPrompt:show', listener);

    expect(await maybeShowRatingPrompt({ delayMs: 0 })).toBe(true);
    jest.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(1);

    const saved = JSON.parse(await AsyncStorage.getItem('ratingPrompt:v1'));
    expect(saved.prompts).toBe(1);
    expect(saved.moments).toBe(0);

    // Not twice in one session.
    expect(await maybeShowRatingPrompt({ delayMs: 0 })).toBe(false);
    sub.remove();
  });

  it('records "Not really"', async () => {
    await markNotReally();
    const saved = JSON.parse(await AsyncStorage.getItem('ratingPrompt:v1'));
    expect(typeof saved.notReallyAt).toBe('number');
  });
});
