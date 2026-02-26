import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const STORAGE_KEYS = {
  enabled: 'meal_reminders_enabled_v1',
  prompted: 'meal_reminders_prompted_v1',
  scheduledIds: 'meal_reminders_scheduled_ids_v1',
  times: 'meal_reminders_times_v1',
};

const DEFAULT_TIMES = {
  breakfast: { hour: 8, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  dinner: { hour: 19, minute: 0 },
};

const ANDROID_CHANNEL_ID = 'meal-reminders';

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors.
  }
}

export async function getMealReminderTimes() {
  const stored = await readJson(STORAGE_KEYS.times, null);
  if (!stored || typeof stored !== 'object') return DEFAULT_TIMES;
  return {
    breakfast: stored.breakfast || DEFAULT_TIMES.breakfast,
    lunch: stored.lunch || DEFAULT_TIMES.lunch,
    dinner: stored.dinner || DEFAULT_TIMES.dinner,
  };
}

export async function setMealReminderTimes(times) {
  await writeJson(STORAGE_KEYS.times, times);
}

export async function getMealRemindersEnabled() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEYS.enabled)) === '1';
  } catch {
    return false;
  }
}

export async function setMealRemindersEnabled(enabled) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, enabled ? '1' : '0');
  } catch {
    // Ignore.
  }
}

export async function getMealRemindersPrompted() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEYS.prompted)) === '1';
  } catch {
    return false;
  }
}

export async function setMealRemindersPrompted() {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.prompted, '1');
  } catch {
    // Ignore.
  }
}

export function configureMealReminderNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Meal reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Ignore.
  }
}

export async function requestMealReminderPermissions() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing?.granted) return true;

    const requested = await Notifications.requestPermissionsAsync(
      Platform.OS === 'ios'
        ? { ios: { allowAlert: true, allowBadge: false, allowSound: false } }
        : undefined
    );
    return Boolean(requested?.granted);
  } catch {
    return false;
  }
}

async function cancelScheduledMealReminders() {
  const ids = await readJson(STORAGE_KEYS.scheduledIds, []);
  if (!Array.isArray(ids) || ids.length === 0) return;
  await Promise.allSettled(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
  await writeJson(STORAGE_KEYS.scheduledIds, []);
}

export async function scheduleMealReminders(times = null) {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) return { scheduled: false, reason: 'disabled' };

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) return { scheduled: false, reason: 'no_permission' };

  await ensureAndroidChannel();
  await cancelScheduledMealReminders();

  const scheduleTimes = times || (await getMealReminderTimes());
  const pairs = [
    { key: 'breakfast', label: 'breakfast' },
    { key: 'lunch', label: 'lunch' },
    { key: 'dinner', label: 'dinner' },
  ];

  const ids = [];
  for (const item of pairs) {
    const triggerTime = scheduleTimes[item.key] || DEFAULT_TIMES[item.key];
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to scan for ${item.label}`,
        body: 'Scan ingredients to get diabetes-friendly recipes.',
      },
      trigger:
        Platform.OS === 'android'
          ? {
              hour: triggerTime.hour,
              minute: triggerTime.minute,
              repeats: true,
              channelId: ANDROID_CHANNEL_ID,
            }
          : {
              hour: triggerTime.hour,
              minute: triggerTime.minute,
              repeats: true,
            },
    });
    ids.push(id);
  }

  await writeJson(STORAGE_KEYS.scheduledIds, ids);
  return { scheduled: true };
}

export async function disableMealReminders() {
  await setMealRemindersEnabled(false);
  await cancelScheduledMealReminders();
}

export async function enableMealRemindersAndSchedule() {
  await setMealRemindersEnabled(true);
  const times = await getMealReminderTimes();
  return scheduleMealReminders(times);
}

export async function syncMealRemindersOnAppStart() {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) return;

  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions?.granted) return;
  } catch {
    return;
  }

  const times = await getMealReminderTimes();
  await ensureAndroidChannel();
  await cancelScheduledMealReminders();
  await scheduleMealReminders(times);
}
