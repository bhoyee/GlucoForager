jest.mock('expo-notifications', () => ({}));
jest.mock('../mealReminders', () => ({ getMealRemindersEnabled: jest.fn() }));

import { planAfterMealCheck } from '../afterMealCheck';

const at = (h, m = 0) => new Date(2026, 9, 18, h, m);

describe('planAfterMealCheck', () => {
  it('reminds 2 hours after the meal', () => {
    expect(planAfterMealCheck(at(12, 10), at(12, 15)).fireAt).toEqual(at(14, 10));
  });

  it('skips a meal logged so late the check is already due', () => {
    expect(planAfterMealCheck(at(10), at(11, 58)).skip).toBe('too_late');
    expect(planAfterMealCheck(at(9), at(13)).skip).toBe('too_late');
  });

  it('never fires between 10pm and 7am', () => {
    expect(planAfterMealCheck(at(20, 30), at(20, 31)).skip).toBe('quiet_hours'); // 22:30
    expect(planAfterMealCheck(at(4, 30), at(4, 31)).skip).toBe('quiet_hours'); // 06:30
    expect(planAfterMealCheck(at(19, 59), at(20)).fireAt).toEqual(at(21, 59));
    expect(planAfterMealCheck(at(5), at(5, 1)).fireAt).toEqual(at(7));
  });

  it('stops after 3 a day', () => {
    expect(planAfterMealCheck(at(12), at(12), 2).fireAt).toBeTruthy();
    expect(planAfterMealCheck(at(12), at(12), 3).skip).toBe('daily_cap');
  });
});
