import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SCAN_STORAGE_KEY,
  initializeScans,
  getTodayScans,
  incrementScan,
  getRemainingScans,
  canUserScan,
} from '../scanTracker';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('initializeScans', () => {
  it('creates a fresh record for today when nothing is stored', async () => {
    const data = await initializeScans();
    expect(data.scansUsed).toBe(0);
    expect(data.lastResetDate).toBe(getTodayDateString());
  });

  it('resets scansUsed when the stored date is stale', async () => {
    await AsyncStorage.setItem(
      SCAN_STORAGE_KEY,
      JSON.stringify({ lastResetDate: '2020-01-01', scansUsed: 3 })
    );
    const data = await initializeScans();
    expect(data.scansUsed).toBe(0);
    expect(data.lastResetDate).toBe(getTodayDateString());
  });

  it('keeps the count when the stored date is today', async () => {
    await AsyncStorage.setItem(
      SCAN_STORAGE_KEY,
      JSON.stringify({ lastResetDate: getTodayDateString(), scansUsed: 2 })
    );
    const data = await initializeScans();
    expect(data.scansUsed).toBe(2);
  });
});

describe('incrementScan', () => {
  it('increases the stored count each call', async () => {
    expect(await incrementScan()).toBe(1);
    expect(await incrementScan()).toBe(2);
    expect(await getTodayScans()).toBe(2);
  });
});

describe('getRemainingScans', () => {
  it('always returns a large number for premium users regardless of usage', async () => {
    await incrementScan();
    await incrementScan();
    expect(await getRemainingScans(true)).toBe(999);
  });

  it('counts down from 3 for free users', async () => {
    expect(await getRemainingScans(false)).toBe(3);
    await incrementScan();
    expect(await getRemainingScans(false)).toBe(2);
  });

  it('never goes below zero for free users', async () => {
    await incrementScan();
    await incrementScan();
    await incrementScan();
    await incrementScan();
    expect(await getRemainingScans(false)).toBe(0);
  });
});

describe('canUserScan', () => {
  it('is always true for premium users', async () => {
    await incrementScan();
    await incrementScan();
    await incrementScan();
    expect(await canUserScan(true)).toBe(true);
  });

  it('is true for free users under the daily limit', async () => {
    expect(await canUserScan(false)).toBe(true);
    await incrementScan();
    await incrementScan();
    expect(await canUserScan(false)).toBe(true);
  });

  it('is false for free users once 3 scans are used', async () => {
    await incrementScan();
    await incrementScan();
    await incrementScan();
    expect(await canUserScan(false)).toBe(false);
  });
});
