import { TIER_LIMITS } from './constants';

export const isPremium = (tier) => tier === 'premium';

export const getMaxScans = (tier) => (tier === 'premium' ? Infinity : TIER_LIMITS.free || 3);
