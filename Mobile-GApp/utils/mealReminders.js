import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDebugLog } from './debugLogger';

const STORAGE_KEYS = {
  enabled: 'meal_reminders_enabled_v1',
  prompted: 'meal_reminders_prompted_v1',
  scheduledIds: 'meal_reminders_scheduled_ids_v1',
  times: 'meal_reminders_times_v1',
  dailyGuidanceScheduledIds: 'daily_guidance_scheduled_ids_v1',
  dailyPlanScheduledIds: 'daily_plan_scheduled_ids_v1',
};

const DEFAULT_TIMES = {
  breakfast: { hour: 8, minute: 0 },
  lunch: { hour: 13, minute: 0 },
  dinner: { hour: 19, minute: 0 },
};

const ANDROID_CHANNEL_ID = 'meal-reminders';
const DAILY_GUIDANCE_ANDROID_CHANNEL_ID = 'daily-guidance';
const DAILY_PLAN_ANDROID_CHANNEL_ID = 'daily-plan';
const SCHEDULE_DAYS_AHEAD = 7;
const PAST_TRIGGER_GRACE_MS = 60 * 1000;
const DAILY_GUIDANCE_TIME = { hour: 9, minute: 30 };
const DAILY_PLAN_TIME = { hour: 7, minute: 30 };
const PREMIUM_STATUS_STORAGE_KEY = 'home_scan_status';

async function getCachedIsPremium() {
  try {
    const raw = await AsyncStorage.getItem(PREMIUM_STATUS_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Boolean(data?.isPremium);
  } catch {
    return false;
  }
}

function debugLog(message, details) {
  if (!__DEV__) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[MealReminders] ${message}`, details || '');
  } catch {
    // Ignore console errors.
  }
  try {
    addDebugLog({
      source: 'MealReminders',
      level: 'info',
      message,
      details: details ? JSON.stringify(details) : undefined,
    });
  } catch {
    // Ignore logger errors.
  }
}

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

function normalizeTime(value, fallback) {
  const fallbackTime = fallback || { hour: 8, minute: 0 };
  const hourRaw = value?.hour;
  const minuteRaw = value?.minute;
  const hour = Number.isFinite(Number(hourRaw)) ? Number(hourRaw) : fallbackTime.hour;
  const minute = Number.isFinite(Number(minuteRaw)) ? Number(minuteRaw) : fallbackTime.minute;
  const safeHour = Math.min(23, Math.max(0, Math.floor(hour)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(minute)));
  return { hour: safeHour, minute: safeMinute };
}

export async function getMealReminderTimes() {
  const stored = await readJson(STORAGE_KEYS.times, null);
  if (!stored || typeof stored !== 'object') return DEFAULT_TIMES;
  const times = {
    breakfast: normalizeTime(stored.breakfast, DEFAULT_TIMES.breakfast),
    lunch: normalizeTime(stored.lunch, DEFAULT_TIMES.lunch),
    dinner: normalizeTime(stored.dinner, DEFAULT_TIMES.dinner),
  };
  debugLog('Loaded reminder times', times);
  return times;
}

export async function setMealReminderTimes(times) {
  const safeTimes = {
    breakfast: normalizeTime(times?.breakfast, DEFAULT_TIMES.breakfast),
    lunch: normalizeTime(times?.lunch, DEFAULT_TIMES.lunch),
    dinner: normalizeTime(times?.dinner, DEFAULT_TIMES.dinner),
  };
  debugLog('Saving reminder times', safeTimes);
  await writeJson(STORAGE_KEYS.times, safeTimes);
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
    debugLog('Set enabled', { enabled });
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
    debugLog('Marked prompted');
  } catch {
    // Ignore.
  }
}

export function configureMealReminderNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
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
    debugLog('Ensured Android channel', { id: ANDROID_CHANNEL_ID });
  } catch {
    // Ignore.
  }
}

async function ensureAndroidDailyGuidanceChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(DAILY_GUIDANCE_ANDROID_CHANNEL_ID, {
      name: 'Daily guidance',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    debugLog('Ensured Android channel', { id: DAILY_GUIDANCE_ANDROID_CHANNEL_ID });
  } catch {
    // Ignore.
  }
}

async function ensureAndroidDailyPlanChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(DAILY_PLAN_ANDROID_CHANNEL_ID, {
      name: 'Daily plan',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    debugLog('Ensured Android channel', { id: DAILY_PLAN_ANDROID_CHANNEL_ID });
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
    debugLog('Requested notification permissions', { granted: requested?.granted });
    return Boolean(requested?.granted);
  } catch {
    return false;
  }
}

async function cancelScheduledMealReminders() {
  const ids = await readJson(STORAGE_KEYS.scheduledIds, []);
  if (!Array.isArray(ids) || ids.length === 0) return;
  debugLog('Cancelling scheduled reminders by IDs', { count: ids.length, ids });
  await Promise.allSettled(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
  await writeJson(STORAGE_KEYS.scheduledIds, []);
}

async function cancelOrphanedMealReminders() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(scheduled) || scheduled.length === 0) return;

    const mealReminderIds = scheduled
      .filter((item) => {
        const title = item?.content?.title || '';
        return typeof title === 'string' && title.toLowerCase().startsWith('time to scan for ');
      })
      .map((item) => item?.identifier)
      .filter(Boolean);

    await Promise.allSettled(
      mealReminderIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
    );
    if (mealReminderIds.length) {
      debugLog('Cancelled orphaned scheduled reminders', { count: mealReminderIds.length });
    }
  } catch {
    // Ignore.
  }
}

async function dismissPresentedMealReminders() {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    if (!Array.isArray(presented) || presented.length === 0) return;
    const ids = presented
      .filter((item) => {
        const title = item?.request?.content?.title || item?.content?.title || '';
        return typeof title === 'string' && title.toLowerCase().startsWith('time to scan for ');
      })
      .map((item) => item?.identifier)
      .filter(Boolean);
    await Promise.allSettled(ids.map((id) => Notifications.dismissNotificationAsync(id)));
    if (ids.length) {
      debugLog('Dismissed presented reminders', { count: ids.length });
    }
  } catch {
    // Ignore.
  }
}

export async function scheduleMealReminders(times = null) {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) {
    debugLog('Schedule skipped (disabled)');
    return { scheduled: false, reason: 'disabled' };
  }

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) {
    debugLog('Schedule skipped (no permission)');
    return { scheduled: false, reason: 'no_permission' };
  }

  await ensureAndroidChannel();
  await cancelScheduledMealReminders();
  await cancelOrphanedMealReminders();
  await dismissPresentedMealReminders();

  const scheduleTimes = times || (await getMealReminderTimes());
  debugLog('Scheduling reminders', { scheduleTimes, daysAhead: SCHEDULE_DAYS_AHEAD });
  const pairs = [
    { key: 'breakfast', label: 'breakfast' },
    { key: 'lunch', label: 'lunch' },
    { key: 'dinner', label: 'dinner' },
  ];

  const ids = [];

  const now = Date.now();
  for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS_AHEAD; dayOffset += 1) {
    for (const item of pairs) {
      const triggerTime = scheduleTimes[item.key] || DEFAULT_TIMES[item.key];
      const target = new Date();
      target.setHours(triggerTime.hour, triggerTime.minute, 0, 0);
      target.setDate(target.getDate() + dayOffset);

      if (target.getTime() <= now + PAST_TRIGGER_GRACE_MS) {
        continue;
      }

      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Time to scan for ${item.label}`,
            body: 'Scan ingredients to get diabetes-friendly recipes.',
            ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
            data: {
              kind: 'meal_reminder',
              meal: item.key,
              scheduledFor: target.toISOString(),
            },
          },
          trigger:
            Platform.OS === 'android'
              ? {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: target,
                  channelId: ANDROID_CHANNEL_ID,
                }
              : {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: target,
                },
        });
        ids.push(id);
      } catch (error) {
        debugLog('Failed to schedule reminder', {
          label: item.label,
          triggerTime,
          dayOffset,
          target: target.toISOString(),
          error: `${error?.message || error}`,
        });
      }
    }
  }

  await writeJson(STORAGE_KEYS.scheduledIds, ids);
  debugLog('Scheduled reminders', { count: ids.length, ids });
  return { scheduled: true };
}

async function cancelScheduledDailyGuidanceNotifications() {
  const ids = await readJson(STORAGE_KEYS.dailyGuidanceScheduledIds, []);
  if (!Array.isArray(ids) || ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await writeJson(STORAGE_KEYS.dailyGuidanceScheduledIds, []);
}

async function cancelOrphanedDailyGuidanceNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ids = (scheduled || [])
      .filter((item) => item?.content?.data?.kind === 'daily_guidance')
      .map((item) => item?.identifier)
      .filter(Boolean);
    await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch {
    // Ignore.
  }
}

export async function cancelTodaysDailyGuidanceNotification() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!Array.isArray(scheduled) || scheduled.length === 0) return;

    const todayKey = new Date().toDateString();
    const todaysIds = scheduled
      .filter((item) => item?.content?.data?.kind === 'daily_guidance')
      .filter((item) => {
        const scheduledFor = item?.content?.data?.scheduledFor;
        if (!scheduledFor) return false;
        const date = new Date(scheduledFor);
        return !Number.isNaN(date.getTime()) && date.toDateString() === todayKey;
      })
      .map((item) => item?.identifier)
      .filter(Boolean);

    if (!todaysIds.length) return;

    await Promise.allSettled(todaysIds.map((id) => Notifications.cancelScheduledNotificationAsync(id)));

    const storedIds = await readJson(STORAGE_KEYS.dailyGuidanceScheduledIds, []);
    if (Array.isArray(storedIds) && storedIds.length) {
      await writeJson(
        STORAGE_KEYS.dailyGuidanceScheduledIds,
        storedIds.filter((id) => !todaysIds.includes(id))
      );
    }

    debugLog("Cancelled today's daily guidance notification", { count: todaysIds.length, ids: todaysIds });
  } catch {
    // Ignore.
  }
}

async function cancelScheduledDailyPlanNotifications() {
  const ids = await readJson(STORAGE_KEYS.dailyPlanScheduledIds, []);
  if (!Array.isArray(ids) || ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await writeJson(STORAGE_KEYS.dailyPlanScheduledIds, []);
}

async function cancelOrphanedDailyPlanNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ids = (scheduled || [])
      .filter((item) => item?.content?.data?.kind === 'daily_plan')
      .map((item) => item?.identifier)
      .filter(Boolean);
    await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch {
    // Ignore.
  }
}

export async function scheduleDailyGuidanceNotifications() {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) {
    debugLog('Daily guidance schedule skipped (disabled)');
    return { scheduled: false, reason: 'disabled' };
  }

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) {
    debugLog('Daily guidance schedule skipped (no permission)');
    return { scheduled: false, reason: 'no_permission' };
  }

  await ensureAndroidDailyGuidanceChannel();
  await cancelScheduledDailyGuidanceNotifications();
  await cancelOrphanedDailyGuidanceNotifications();

  const ids = [];
  const now = Date.now();
  for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS_AHEAD; dayOffset += 1) {
    const target = new Date();
    target.setHours(DAILY_GUIDANCE_TIME.hour, DAILY_GUIDANCE_TIME.minute, 0, 0);
    target.setDate(target.getDate() + dayOffset);

    if (target.getTime() <= now + PAST_TRIGGER_GRACE_MS) {
      continue;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily Guidance',
          body: "Keep your streak alive - today's challenge is waiting. Tap to finish it.",
          ...(Platform.OS === 'android' ? { channelId: DAILY_GUIDANCE_ANDROID_CHANNEL_ID } : {}),
          data: {
            kind: 'daily_guidance',
            scheduledFor: target.toISOString(),
          },
        },
        trigger:
          Platform.OS === 'android'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: target,
                channelId: DAILY_GUIDANCE_ANDROID_CHANNEL_ID,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: target,
              },
      });
      ids.push(id);
    } catch (error) {
      debugLog('Failed to schedule daily guidance', {
        dayOffset,
        target: target.toISOString(),
        error: `${error?.message || error}`,
      });
    }
  }

  await writeJson(STORAGE_KEYS.dailyGuidanceScheduledIds, ids);
  debugLog('Scheduled daily guidance', { count: ids.length, ids, time: DAILY_GUIDANCE_TIME });
  return { scheduled: true };
}

export async function scheduleDailyPlanNotifications({ isPremium } = {}) {
  const enabled = await getMealRemindersEnabled();
  if (!enabled) {
    debugLog('Daily plan schedule skipped (disabled)');
    return { scheduled: false, reason: 'disabled' };
  }

  const premium = typeof isPremium === 'boolean' ? isPremium : await getCachedIsPremium();
  if (!premium) {
    await cancelScheduledDailyPlanNotifications();
    await cancelOrphanedDailyPlanNotifications();
    debugLog('Daily plan schedule skipped (not premium)');
    return { scheduled: false, reason: 'not_premium' };
  }

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) {
    debugLog('Daily plan schedule skipped (no permission)');
    return { scheduled: false, reason: 'no_permission' };
  }

  await ensureAndroidDailyPlanChannel();
  await cancelScheduledDailyPlanNotifications();
  await cancelOrphanedDailyPlanNotifications();

  const ids = [];
  const now = Date.now();
  for (let dayOffset = 0; dayOffset < SCHEDULE_DAYS_AHEAD; dayOffset += 1) {
    const target = new Date();
    target.setHours(DAILY_PLAN_TIME.hour, DAILY_PLAN_TIME.minute, 0, 0);
    target.setDate(target.getDate() + dayOffset);

    if (target.getTime() <= now + PAST_TRIGGER_GRACE_MS) {
      continue;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily Plan',
          body: 'Plan your meals for today. Tap to generate your daily plan.',
          ...(Platform.OS === 'android' ? { channelId: DAILY_PLAN_ANDROID_CHANNEL_ID } : {}),
          data: {
            kind: 'daily_plan',
            scheduledFor: target.toISOString(),
          },
        },
        trigger:
          Platform.OS === 'android'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: target,
                channelId: DAILY_PLAN_ANDROID_CHANNEL_ID,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: target,
              },
      });
      ids.push(id);
    } catch (error) {
      debugLog('Failed to schedule daily plan', {
        dayOffset,
        target: target.toISOString(),
        error: `${error?.message || error}`,
      });
    }
  }

  await writeJson(STORAGE_KEYS.dailyPlanScheduledIds, ids);
  debugLog('Scheduled daily plan', { count: ids.length, ids, time: DAILY_PLAN_TIME });
  return { scheduled: true };
}

export async function disableMealReminders() {
  debugLog('Disabling reminders');
  await setMealRemindersEnabled(false);
  await cancelScheduledMealReminders();
  await cancelOrphanedMealReminders();
  await dismissPresentedMealReminders();
  await cancelScheduledDailyGuidanceNotifications();
  await cancelOrphanedDailyGuidanceNotifications();
  await cancelScheduledDailyPlanNotifications();
  await cancelOrphanedDailyPlanNotifications();
}

export async function enableMealRemindersAndSchedule({ isPremium } = {}) {
  debugLog('Enabling reminders');

  const hasPermission = await requestMealReminderPermissions();
  if (!hasPermission) {
    await setMealRemindersEnabled(false);
    return { scheduled: false, reason: 'no_permission' };
  }

  await setMealRemindersEnabled(true);
  const times = await getMealReminderTimes();
  const result = await scheduleMealReminders(times);
  try {
    await scheduleDailyGuidanceNotifications();
  } catch {
    // Ignore daily guidance scheduling failures.
  }
  try {
    await scheduleDailyPlanNotifications({ isPremium });
  } catch {
    // Ignore.
  }
  return result;
}

export async function syncMealRemindersOnAppStart({ isPremium } = {}) {
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
  await cancelOrphanedMealReminders();
  await scheduleMealReminders(times);

  try {
    await scheduleDailyGuidanceNotifications();
  } catch {
    // Ignore.
  }

  try {
    await scheduleDailyPlanNotifications({ isPremium });
  } catch {
    // Ignore.
  }
}

export async function devInspectScheduledNotifications() {
  if (!__DEV__) return null;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const meal = (scheduled || []).filter((item) => {
      const title = item?.content?.title || '';
      return typeof title === 'string' && title.toLowerCase().startsWith('time to scan for ');
    });
    const guidance = (scheduled || []).filter((item) => item?.content?.data?.kind === 'daily_guidance');
    const dailyPlan = (scheduled || []).filter((item) => item?.content?.data?.kind === 'daily_plan');

    const now = new Date();
    const tzOffsetMinutes = now.getTimezoneOffset();
    const mealNext = await Promise.all(
      meal.map(async (item) => {
        const contentData = item?.content?.data || {};
        const scheduledFor = typeof contentData?.scheduledFor === 'string' ? contentData.scheduledFor : null;
        const trigger = item?.trigger;
        const triggerType = trigger?.type != null ? String(trigger.type) : null;

        try {
          let nextDate = null;

          if (triggerType && triggerType.toLowerCase() === 'date') {
            const raw = trigger?.date || scheduledFor;
            nextDate = raw ? new Date(raw) : null;
          } else {
            const next = await Notifications.getNextTriggerDateAsync(trigger);
            nextDate = next ? new Date(next) : null;
          }

          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: nextDate ? nextDate.toISOString() : null,
            next_local: nextDate ? nextDate.toLocaleString() : null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
          };
        } catch (error) {
          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: null,
            next_local: null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
            error: `${error?.message || error}`,
          };
        }
      })
    );

    const guidanceNext = await Promise.all(
      guidance.map(async (item) => {
        const contentData = item?.content?.data || {};
        const scheduledFor = typeof contentData?.scheduledFor === 'string' ? contentData.scheduledFor : null;
        const trigger = item?.trigger;
        const triggerType = trigger?.type != null ? String(trigger.type) : null;

        try {
          let nextDate = null;

          if (triggerType && triggerType.toLowerCase() === 'date') {
            const raw = trigger?.date || scheduledFor;
            nextDate = raw ? new Date(raw) : null;
          } else {
            const next = await Notifications.getNextTriggerDateAsync(trigger);
            nextDate = next ? new Date(next) : null;
          }

          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: nextDate ? nextDate.toISOString() : null,
            next_local: nextDate ? nextDate.toLocaleString() : null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
          };
        } catch (error) {
          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: null,
            next_local: null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
            error: `${error?.message || error}`,
          };
        }
      })
    );

    const dailyPlanNext = await Promise.all(
      dailyPlan.map(async (item) => {
        const contentData = item?.content?.data || {};
        const scheduledFor = typeof contentData?.scheduledFor === 'string' ? contentData.scheduledFor : null;
        const trigger = item?.trigger;
        const triggerType = trigger?.type != null ? String(trigger.type) : null;

        try {
          let nextDate = null;

          if (triggerType && triggerType.toLowerCase() === 'date') {
            const raw = trigger?.date || scheduledFor;
            nextDate = raw ? new Date(raw) : null;
          } else {
            const next = await Notifications.getNextTriggerDateAsync(trigger);
            nextDate = next ? new Date(next) : null;
          }

          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: nextDate ? nextDate.toISOString() : null,
            next_local: nextDate ? nextDate.toLocaleString() : null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
          };
        } catch (error) {
          return {
            id: item?.identifier,
            title: item?.content?.title,
            next_iso: null,
            next_local: null,
            scheduled_for: scheduledFor,
            trigger_type: triggerType,
            trigger_date: trigger?.date ? String(trigger.date) : null,
            error: `${error?.message || error}`,
          };
        }
      })
    );
    debugLog('Inspect scheduled notifications', {
      now_iso: now.toISOString(),
      now_local: now.toLocaleString(),
      tz_offset_minutes: tzOffsetMinutes,
      total: Array.isArray(scheduled) ? scheduled.length : 0,
      meal_count: meal.length,
      meal_titles: meal.map((m) => m?.content?.title).filter(Boolean),
      meal_next: mealNext,
      daily_guidance_count: guidance.length,
      daily_guidance_next: guidanceNext,
      daily_plan_count: dailyPlan.length,
      daily_plan_next: dailyPlanNext,
    });
    return {
      total: scheduled?.length || 0,
      mealCount: meal.length,
      dailyGuidanceCount: guidance.length,
      dailyPlanCount: dailyPlan.length,
    };
  } catch (error) {
    debugLog('Inspect scheduled notifications failed', { error: `${error?.message || error}` });
    return null;
  }
}

export async function devSendTestMealNotification() {
  if (!__DEV__) return;
  try {
    await ensureAndroidChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test: Time to scan',
        body: 'This is a dev test notification.',
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger:
        Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
              channelId: ANDROID_CHANNEL_ID,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
            },
    });
    debugLog('Scheduled test notification', { id });
  } catch (error) {
    debugLog('Test notification failed', { error: `${error?.message || error}` });
  }
}

export async function devSendTestDailyGuidanceNotification() {
  if (!__DEV__) return;
  try {
    await ensureAndroidDailyGuidanceChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test: Daily Guidance',
        body: "Your daily tip + challenge are ready. Tap to start.",
        ...(Platform.OS === 'android' ? { channelId: DAILY_GUIDANCE_ANDROID_CHANNEL_ID } : {}),
        data: { kind: 'daily_guidance_test' },
      },
      trigger:
        Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
              channelId: DAILY_GUIDANCE_ANDROID_CHANNEL_ID,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
            },
    });
    debugLog('Scheduled test daily guidance', { id });
  } catch (error) {
    debugLog('Test daily guidance failed', { error: `${error?.message || error}` });
  }
}

export async function devSendTestDailyPlanNotification() {
  if (!__DEV__) return;
  try {
    await ensureAndroidDailyPlanChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test: Daily Plan',
        body: 'Tap to generate your daily plan.',
        ...(Platform.OS === 'android' ? { channelId: DAILY_PLAN_ANDROID_CHANNEL_ID } : {}),
        data: { kind: 'daily_plan_test' },
      },
      trigger:
        Platform.OS === 'android'
          ? {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
              channelId: DAILY_PLAN_ANDROID_CHANNEL_ID,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 2,
              repeats: false,
            },
    });
    debugLog('Scheduled test daily plan', { id });
  } catch (error) {
    debugLog('Test daily plan failed', { error: `${error?.message || error}` });
  }
}
