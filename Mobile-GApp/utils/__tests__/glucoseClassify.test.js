import { classifyReading } from '../glucose';

const s = (v, c) => classifyReading(v, c).status;

describe('classifyReading (mirrors backend glucose_targets.classify)', () => {
  it('before meals is 80-130 inclusive', () => {
    expect(s(80, 'fasting')).toBe('in_range');
    expect(s(130, 'before_meal')).toBe('in_range');
    expect(s(131, 'fasting')).toBe('above');
    expect(s(75, 'fasting')).toBe('below');
  });
  it('after meals is below 180', () => {
    expect(s(179, 'after_meal')).toBe('in_range');
    expect(s(180, 'after_meal')).toBe('above');
  });
  it('untagged is 70-180, with fixed low and very high', () => {
    expect(s(100)).toBe('in_range');
    expect(s(69)).toBe('low');
    expect(s(250)).toBe('very_high');
  });
  it('uses personal targets', () => {
    expect(classifyReading(165, 'after_meal', { premeal_low: 80, premeal_high: 130, postmeal_high: 160 })).toEqual({ status: 'above', delta_mg_dl: 5 });
  });
});
