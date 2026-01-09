// utils/scanTracker.js - UPDATED (NO NETWORK CALLS)
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCAN_STORAGE_KEY = 'scan_data';

// Helper function to get today's date in YYYY-MM-DD format consistently
const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export async function initializeScans() {
  try {
    const scanDataStr = await AsyncStorage.getItem(SCAN_STORAGE_KEY);
    const today = getTodayDateString();
    
    if (!scanDataStr) {
      // First time - initialize
      const initialData = {
        lastResetDate: today,
        scansUsed: 0,
      };
      await AsyncStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(initialData));
      return initialData;
    }
    
    const scanData = JSON.parse(scanDataStr);
    
    // Check if it's a new day
    if (scanData.lastResetDate !== today) {
      // Reset for new day
      const newData = {
        lastResetDate: today,
        scansUsed: 0,
      };
      await AsyncStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(newData));
      return newData;
    }
    
    return scanData;
  } catch (error) {
    console.error('Error initializing scans:', error);
    return { lastResetDate: getTodayDateString(), scansUsed: 0 };
  }
}

export async function getTodayScans() {
  try {
    const scanData = await initializeScans();
    return scanData.scansUsed;
  } catch (error) {
    console.error('Error getting today scans:', error);
    return 0;
  }
}

export async function incrementScan() {
  try {
    const scanData = await initializeScans();
    scanData.scansUsed += 1;
    await AsyncStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(scanData));
    return scanData.scansUsed;
  } catch (error) {
    console.error('Error incrementing scan:', error);
    return 0;
  }
}

export async function resetScansForTesting() {
  // Only for development/testing
  const testData = {
    lastResetDate: getTodayDateString(),
    scansUsed: 0,
  };
  await AsyncStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(testData));
  return testData;
}

export async function getRemainingScans(isPremium) {
  if (isPremium) {
    return 999; // Use a large number instead of Infinity
  }
  
  try {
    const scansUsed = await getTodayScans();
    return Math.max(0, 3 - scansUsed);
  } catch (error) {
    console.error('Error getting remaining scans:', error);
    return 0;
  }
}

export async function canUserScan(isPremium) {
  if (isPremium) {
    return true; // Premium users can always scan
  }
  
  try {
    const scanData = await initializeScans();
    return scanData.scansUsed < 3;
  } catch (error) {
    console.error('Error checking if user can scan:', error);
    return false; // Default to false on error
  }
}