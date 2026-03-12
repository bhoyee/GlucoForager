const TIPS = [
  {
    id: 'protein-first',
    title: 'Protein first',
    body: 'Eating protein before carbs can help blunt your glucose spike. Try starting with eggs, chicken, fish, or Greek yogurt before the starchy part of the meal.',
  },
  {
    id: 'fiber-add',
    title: 'Add fiber',
    body: 'Add fiber to slow digestion: leafy greens, chia seeds, beans, or a side salad can make the same meal gentler on blood sugar.',
  },
  {
    id: 'portion-plate',
    title: 'The plate method',
    body: 'Aim for: ½ non‑starchy veg, ¼ protein, ¼ carbs. It’s a simple way to build balanced meals without counting everything.',
  },
  {
    id: 'walk-after',
    title: '10‑minute walk',
    body: 'A short walk after eating can reduce post‑meal glucose rise. Even 10 minutes at an easy pace helps.',
  },
  {
    id: 'hydrate',
    title: 'Hydrate',
    body: 'Dehydration can make glucose readings look higher. Sip water through the day, especially around meals.',
  },
  {
    id: 'vinegar',
    title: 'A little acidity',
    body: 'Vinegar or lemon juice with a meal may reduce post‑meal spikes for some people. Use it in dressings or marinades.',
  },
  {
    id: 'sleep',
    title: 'Sleep matters',
    body: 'Poor sleep can increase insulin resistance the next day. A consistent bedtime helps glucose control and cravings.',
  },
  {
    id: 'swap-drink',
    title: 'Watch drinks',
    body: 'Sugary drinks spike fast. Choose water, sparkling water, or unsweetened tea/coffee most of the time.',
  },
];

const dayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date -
    start +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export const getTodayTip = (now = new Date()) => {
  const index = Math.abs(dayOfYear(now)) % TIPS.length;
  return TIPS[index];
};

