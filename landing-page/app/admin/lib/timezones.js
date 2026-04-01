export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (Nigeria)' },
  { value: 'Europe/London', label: 'Europe/London (UK)' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'America/Toronto', label: 'America/Toronto' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UAE)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
];

// Default timezone per country (ISO alpha-2) for staff creation.
// Note: some countries have multiple timezones; we choose a sensible default.
const COUNTRY_DEFAULT_TIMEZONE = {
  GB: 'Europe/London',
  NG: 'Africa/Lagos',
  US: 'America/New_York',
  CA: 'America/Toronto',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  AE: 'Asia/Dubai',
  IN: 'Asia/Kolkata',
  SG: 'Asia/Singapore',
  JP: 'Asia/Tokyo',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
};

export function defaultTimezoneForCountry(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) return 'UTC';
  return COUNTRY_DEFAULT_TIMEZONE[code] || 'UTC';
}
