export const checkDailyLimit = (tier, scansToday) => {
  if (tier === 'premium') {
    return { canScan: true, message: 'Unlimited scans', remaining: Infinity };
  }
  const remaining = Math.max(0, 3 - scansToday);
  return {
    canScan: remaining > 0,
    message: `Scans today: ${scansToday}/3`,
    remaining,
  };
};
