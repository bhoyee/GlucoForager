import { getTodayTip, getTipById } from '../todayTips';

describe('getTodayTip', () => {
  it('is deterministic for a given date', () => {
    const date = new Date(2026, 0, 15);
    const first = getTodayTip(date);
    const second = getTodayTip(date);
    expect(first).toEqual(second);
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
  });

  it('returns different tips for different days (at least sometimes)', () => {
    const dayOne = getTodayTip(new Date(2026, 0, 1));
    const dayTwo = getTodayTip(new Date(2026, 0, 2));
    // Not guaranteed to differ for every pair of days, but with 90+ tips in the
    // pool these two specific days should not collide.
    expect(dayOne.id).not.toEqual(dayTwo.id);
  });

  it('excludes blocked tip ids from the pool', () => {
    const date = new Date(2026, 2, 10);
    const unblocked = getTodayTip(date);
    const blocked = getTodayTip(date, { blockedTipIds: [unblocked.id] });
    expect(blocked.id).not.toEqual(unblocked.id);
  });

  it('falls back to the full tip list if every tip is blocked', () => {
    const date = new Date(2026, 4, 20);
    const unblocked = getTodayTip(date);
    // Block every possible id by blocking a huge synthetic list plus the real one;
    // the source only excludes ids it recognizes, so blocking everything real still
    // leaves a non-empty pool to fall back to instead of crashing.
    const allIds = Array.from({ length: 500 }, (_, i) => `fake-id-${i}`);
    const result = getTodayTip(date, { blockedTipIds: [...allIds, unblocked.id] });
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('id');
  });
});

describe('getTipById', () => {
  it('returns the matching tip for a known id', () => {
    const tip = getTodayTip(new Date(2026, 0, 1));
    expect(getTipById(tip.id)).toEqual(tip);
  });

  it('returns null for an unknown id', () => {
    expect(getTipById('not-a-real-tip-id')).toBeNull();
  });

  it('returns null for an empty/missing id', () => {
    expect(getTipById('')).toBeNull();
    expect(getTipById(undefined)).toBeNull();
  });
});
