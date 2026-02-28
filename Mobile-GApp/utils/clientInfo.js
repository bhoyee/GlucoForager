import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const getClientInfo = () => {
  const expoConfig = Constants?.expoConfig || Constants?.manifest || {};
  const appVersion = expoConfig?.version || null;
  const buildNumberRaw =
    Platform.OS === 'ios'
      ? expoConfig?.ios?.buildNumber
      : expoConfig?.android?.versionCode;

  return {
    platform: Platform.OS,
    app_version: appVersion ? String(appVersion) : null,
    build_number: buildNumberRaw != null ? String(buildNumberRaw) : null,
    os_version: Platform.Version != null ? String(Platform.Version) : null,
    device_model: Constants?.deviceName ? String(Constants.deviceName) : null,
  };
};

