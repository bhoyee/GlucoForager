import { Alert } from 'react-native';
import {
  FREE_FEATURES,
  freeUsesLabel,
  getFreeUsage,
  hasFreeUsesLeft,
  isFreeLimitDetail,
  showFreeLimitAlert,
} from '../freeTier';

const accessWith = (features) => ({
  has_feature_access: false,
  free_usage: { resets_at: '2026-10-19T00:00:00', features },
});

describe('freeTier', () => {
  it('reads weekly usage for a feature', () => {
    const data = accessWith({ glucoguide: { limit: 3, used: 1, remaining: 2 } });
    expect(getFreeUsage(data, FREE_FEATURES.GLUCOGUIDE)).toEqual({ limit: 3, used: 1, remaining: 2 });
    expect(hasFreeUsesLeft(data, FREE_FEATURES.GLUCOGUIDE)).toBe(true);
  });

  it('treats missing free_usage as unlimited (Premium, trial or welcome week)', () => {
    const data = { has_feature_access: true, free_usage: null };
    expect(getFreeUsage(data, FREE_FEATURES.INGREDIENT_SCAN)).toBeNull();
    expect(hasFreeUsesLeft(data, FREE_FEATURES.INGREDIENT_SCAN)).toBe(false);
  });

  it('labels remaining uses and the empty state', () => {
    expect(freeUsesLabel({ limit: 2, used: 0, remaining: 2 }, FREE_FEATURES.INGREDIENT_SCAN)).toBe(
      '2 of 2 free scans left this week'
    );
    expect(freeUsesLabel({ limit: 3, used: 3, remaining: 0 }, FREE_FEATURES.RECIPE_GENERATION)).toBe(
      'No free recipe generations left this week · more on Monday'
    );
    expect(freeUsesLabel(null, FREE_FEATURES.SWAPS)).toBeNull();
    // Admin set the allowance to 0: the feature is Premium-only.
    expect(freeUsesLabel({ limit: 0, used: 0, remaining: 0 }, FREE_FEATURES.FOOD_SCAN)).toBe(
      'Premium feature · upgrade to unlock'
    );
  });

  it('recognises free-limit errors but not the old trial paywall', () => {
    expect(isFreeLimitDetail({ code: 'free_limit_reached' })).toBe(true);
    expect(isFreeLimitDetail({ code: 'premium_feature' })).toBe(true);
    expect(isFreeLimitDetail({ code: 'trial_expired' })).toBe(false);
    expect(isFreeLimitDetail('some string')).toBe(false);
  });

  it('shows the server message with an Upgrade button', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onUpgrade = jest.fn();
    showFreeLimitAlert({ code: 'free_limit_reached', message: 'Used 3 free questions.' }, onUpgrade);

    const [title, message, buttons] = spy.mock.calls[0];
    expect(title).toBe("You've used this week's free uses");
    expect(message).toBe('Used 3 free questions.');
    buttons.find((b) => b.text === 'Upgrade').onPress();
    expect(onUpgrade).toHaveBeenCalled();
    spy.mockRestore();
  });
});
