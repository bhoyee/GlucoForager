// Backend timestamps should always carry a timezone marker (UTC "Z"), but parse
// defensively: a bare "YYYY-MM-DDTHH:mm:ss" string (no Z / offset) gets silently
// treated by JS's Date parser as *device-local* time instead of UTC, which shifts
// every displayed time by the user's UTC offset - exactly the "glucose log times
// don't match my clock" bug. Treat anything without an explicit timezone as UTC
// instead of trusting the parser's default.
export function parseServerDate(value) {
  if (value == null) return new Date(NaN);
  if (value instanceof Date) return value;
  const str = String(value);
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(str);
  return new Date(hasTimezone ? str : `${str}Z`);
}
