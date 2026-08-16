'use client';

import { useState } from 'react';
import Image from 'next/image';

const features = [
  {
    title: 'Ingredient scan',
    eyebrow: 'Scan what you have',
    description:
      'Take a photo of your fridge or pantry and GlucoForager identifies usable ingredients for diabetes-friendly meals.',
    image: '/screenshots/Scan-ingredients-(camera%20view).jpeg',
    alt: 'GlucoForager camera screen for scanning ingredients',
    points: ['Fridge and pantry scanning', 'Ingredient review before recipes', 'Manual edits when AI misses something'],
    icon: 'scan',
  },
  {
    title: 'Type ingredients',
    eyebrow: 'No photo needed',
    description:
      'Type the foods you have and get recipe ideas without having to search, browse, or build a meal from scratch.',
    image: '/screenshots/type-ingredients.png',
    alt: 'Typed ingredient input screen in GlucoForager',
    points: ['Fast typed input', 'Spelling cleanup', 'Clear guidance when more balance is needed'],
    icon: 'keyboard',
  },
  {
    title: 'GlucoGuide AI',
    eyebrow: 'Ask food questions',
    description:
      'Use GlucoGuide AI for quick food questions, swaps, plate balance, and everyday guidance when you are unsure.',
    image: '/screenshots/glucoguide-ai.png',
    alt: 'GlucoForager home screen with guidance features',
    points: ['Food questions', 'Profile-aware guidance', 'Practical next steps'],
    icon: 'chat',
  },
  {
    title: 'Food swaps',
    eyebrow: 'Keep familiar foods',
    description:
      'Find smarter alternatives for snacks, drinks, and common foods without turning diabetes eating into restriction.',
    image: '/screenshots/food-swaps.png',
    alt: 'Ingredient and swap related screen in GlucoForager',
    points: ['Lower-impact alternatives', 'Portion-aware suggestions', 'Useful everyday swaps'],
    icon: 'swap',
  },
  {
    title: 'Shopping list',
    eyebrow: 'Shop with a plan',
    description:
      'Build a shopping list from scratch or straight from a recipe, then check items off as you shop.',
    image: '/screenshots/shopping-list.jpeg',
    alt: 'Shopping list screen in GlucoForager',
    points: ['Add items from any recipe', 'Build lists from scratch', 'Check off items while shopping'],
    icon: 'cart',
  },
  {
    title: 'Daily meal planner',
    eyebrow: 'Structure the day',
    description:
      'Premium users can generate breakfast, lunch, dinner, and snack ideas that fit their profile and preferences.',
    image: '/screenshots/daily-meal-planner.png',
    alt: 'Recipe detail screen in GlucoForager',
    points: ['Breakfast to snack planning', 'Personal preferences', 'Less decision fatigue'],
    icon: 'calendar',
  },
  {
    title: 'Favourites and history',
    eyebrow: 'Reuse what works',
    description:
      'Save meals and revisit recent recipes so successful choices become easier to repeat over time.',
    image: '/screenshots/favorites-history.jpg',
    alt: 'Saved favourites screen in GlucoForager',
    points: ['Saved meals', 'Recent recipe history', 'Personal safe-food library'],
    icon: 'save',
  },
];

function FeatureIcon({ type }) {
  const paths = {
    scan: <path d="M5 7V5a2 2 0 0 1 2-2h2m6 0h2a2 2 0 0 1 2 2v2M5 17v2a2 2 0 0 0 2 2h2m6 0h2a2 2 0 0 0 2-2v-2M8 12h8M12 8v8" />,
    keyboard: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Zm4 2h.01M11 9.5h.01M14 9.5h.01M17 9.5h.01M8 13h.01M11 13h6M8 16h8" />,
    chat: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H12l-5 4v-4h-.5A2.5 2.5 0 0 1 4 12.5v-7Z" />,
    swap: <path d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" />,
    cart: <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.5 8H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
    calendar: <path d="M7 3v3m10-3v3M4 8h16M6 12h4v4H6v-4Zm8 .5h4M14 16h3" />,
    save: <path d="M6 4h10l2 2v14l-6-3-6 3V4Z" />,
  };

  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[type]}
      </g>
    </svg>
  );
}

export default function Features() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = features[activeIndex];
  const selectFeature = (index) => {
    setActiveIndex((current) => (current === index ? current : index));
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="flex flex-col rounded-[2rem] border border-gray-200 bg-[#F7FBF9] p-3 shadow-sm sm:p-4 lg:min-h-0">
        <div className="grid gap-2 overflow-y-auto pr-1 lg:min-h-0 lg:flex-1">
          {features.map((feature, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={feature.title}
                type="button"
                onMouseEnter={() => selectFeature(index)}
                onFocus={() => selectFeature(index)}
                onClick={() => selectFeature(index)}
                className={`group w-full rounded-2xl border p-4 text-left transition duration-200 ${
                  selected
                    ? 'border-teal-200 bg-white shadow-lg shadow-teal-900/10'
                    : 'border-transparent bg-transparent hover:border-teal-100 hover:bg-white/70'
                }`}
              >
                <div className="flex gap-4">
                  <div
                    className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl transition ${
                      selected ? 'bg-teal-600 text-white' : 'bg-white text-teal-700 group-hover:bg-teal-50'
                    }`}
                  >
                    <FeatureIcon type={feature.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-teal-700">
                      {feature.eyebrow}
                    </p>
                    <h3 className="mt-1 text-base font-extrabold text-gray-950">{feature.title}</h3>
                    <p className={`mt-2 text-sm leading-6 ${selected ? 'text-gray-650' : 'text-gray-500'}`}>
                      {feature.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col rounded-[2rem] border border-gray-200 bg-white p-4 shadow-2xl shadow-teal-950/10">
        <div className="grid flex-1 gap-5 overflow-hidden rounded-[1.5rem] bg-[#073f3a] p-5 text-white md:grid-cols-2 md:p-5 xl:p-6">
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-teal-200">{active.eyebrow}</p>
              <h3 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{active.title}</h3>
              <p className="mt-4 text-sm leading-7 text-teal-50/85">{active.description}</p>
            </div>

            <div className="mt-5 grid gap-2.5">
              {active.points.map((point) => (
                <div key={point} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-teal-50">
                  <span className="h-2 w-2 rounded-full bg-teal-300" />
                  {point}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-[220px] sm:w-[240px] md:w-[220px] lg:w-[240px] xl:w-[260px] aspect-[9/19.5]">
            {/* Outer frame / bezel */}
            <div className="absolute inset-0 rounded-[2.5rem] bg-white shadow-2xl ring-1 ring-black/10"></div>
            {/* Screen */}
            <div className="absolute inset-[10px] rounded-[2rem] overflow-hidden bg-black ring-1 ring-black/5">
              <Image
                src={active.image}
                alt={active.alt}
                fill
                sizes="260px"
                className="object-cover"
              />
            </div>
            {/* Dynamic Island notch */}
            <div className="absolute left-1/2 top-[24px] h-[20px] w-[80px] -translate-x-1/2 rounded-full bg-black z-10"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
