// Glucose display helpers for the Home "Track today" card and "My targets".
// The backend stores and classifies everything in mg/dL (see backend glucose_targets.py);
// the app shows values in the user's chosen unit (same preference as Log glucose).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

export const MGDL_PER_MMOL = 18.0182;
export const UNIT_PREF_KEY = 'glucose_unit_pref_v1';

export const getGlucoseUnit = async () => {
  try {
    const stored = await AsyncStorage.getItem(UNIT_PREF_KEY);
    return stored === 'mmol/L' ? 'mmol/L' : 'mg/dL';
  } catch {
    return 'mg/dL';
  }
};

// Shared with Log glucose, so a change in either place applies everywhere.
export const setGlucoseUnit = async (unit) => {
  try {
    await AsyncStorage.setItem(UNIT_PREF_KEY, unit === 'mmol/L' ? 'mmol/L' : 'mg/dL');
  } catch {
    // Non-fatal: the screen still shows the chosen unit for this session.
  }
};

export const toUnitValue = (mgDl, unit) =>
  unit === 'mmol/L' ? Math.round((Number(mgDl) / MGDL_PER_MMOL) * 10) / 10 : Math.round(Number(mgDl));

export const fromUnitValue = (value, unit) =>
  unit === 'mmol/L' ? Math.round(Number(value) * MGDL_PER_MMOL) : Math.round(Number(value));

export const formatGlucose = (mgDl, unit) => {
  const v = toUnitValue(mgDl, unit);
  return `${unit === 'mmol/L' ? v.toFixed(1) : v} ${unit}`;
};

// Amber for a normal miss (common after meals, shouldn't feel like failing); red only for
// the two states that need attention: lows and very highs.
export const GLUCOSE_STATUS = {
  in_range: { label: 'On target', color: Colors.success, tone: 'good' },
  above: { label: 'Above target', color: '#B7791F', tone: 'warn' },
  below: { label: 'Below target', color: '#B7791F', tone: 'warn' },
  very_high: { label: 'Very high', color: '#C53030', tone: 'alert' },
  low: { label: 'Low', color: '#C53030', tone: 'alert' },
};

export const statusMeta = (status) => GLUCOSE_STATUS[status] || GLUCOSE_STATUS.in_range;

// "On target" / "2.0 above target" / "36 below target" - the distance is in the user's unit,
// which is already shown next to the reading itself.
export const describeReading = (last, unit) => {
  if (!last) return null;
  const meta = statusMeta(last.status);
  const delta = Number(last.delta_mg_dl) || 0;
  if (!['above', 'below'].includes(last.status) || delta <= 0) return meta.label;
  const amount = unit === 'mmol/L' ? (delta / MGDL_PER_MMOL).toFixed(1) : `${Math.round(delta)}`;
  return `${amount} ${last.status} target`;
};

export const SAFETY_LINES = {
  low: 'If you feel unwell, follow your low blood sugar plan.',
  very_high: 'If readings stay this high, contact your healthcare team.',
};

export const CONTEXT_LABELS = {
  fasting: 'Fasting',
  before_meal: 'Before meal',
  after_meal: 'After meal',
  bedtime: 'Bedtime',
};

export const timeAgo = (iso) => {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};
