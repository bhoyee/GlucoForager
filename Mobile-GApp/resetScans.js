// resetScans.js
import AsyncStorage from '@react-native-async-storage/async-storage';

(async () => {
  console.log('Resetting scan data...');
  
  // Reset the new scan tracker
  await AsyncStorage.setItem('scan_data', JSON.stringify({
    lastResetDate: new Date().toISOString().split('T')[0],
    scansUsed: 0
  }));
  
  // Reset the old scan counter
  await AsyncStorage.setItem('todayScans', '0');
  
  console.log('✅ Done! Scans reset to 0.');
})();