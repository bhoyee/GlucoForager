"""seed initial blog posts

Revision ID: 20260221_0010
Revises: 20260221_0009
Create Date: 2026-02-21
"""

from datetime import datetime

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260221_0010"
down_revision = "20260221_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.utcnow()

    blog_posts = sa.table(
        "blog_posts",
        sa.column("slug", sa.String()),
        sa.column("title", sa.String()),
        sa.column("excerpt", sa.String()),
        sa.column("content", sa.Text()),
        sa.column("status", sa.String()),
        sa.column("author_name", sa.String()),
        sa.column("published_at", sa.DateTime()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )

    seeds = [
        {
            "slug": "diabetes-friendly-breakfast-ideas",
            "title": "4 Diabetes-Friendly Breakfast Ideas (Fast + Filling)",
            "excerpt": "Simple, balanced breakfast options that support steadier blood sugar—without cooking all morning.",
            "content": """# 4 Diabetes-Friendly Breakfast Ideas (Fast + Filling)

Breakfast can set the tone for your day—especially if you’re aiming for steadier blood sugar.
The goal is usually **protein + fiber + healthy fats**, with carbs chosen thoughtfully.

## 1) Greek yogurt bowl (no added sugar)

- Plain Greek yogurt
- Berries (fresh or frozen)
- Chia seeds or ground flaxseed
- A small handful of nuts

Tip: If you want extra sweetness, try cinnamon or vanilla extract instead of syrup.

## 2) Eggs + veggies (any style)

Scramble, omelet, or boiled eggs—pair with vegetables like spinach, tomatoes, mushrooms, or peppers.
Add avocado or a small portion of whole-grain toast if desired.

## 3) High-fiber oatmeal (the “balanced” version)

If you enjoy oatmeal, make it more blood-sugar-friendly:

- Use plain oats
- Add protein (Greek yogurt, eggs on the side, or a protein shake)
- Add fiber/fat (chia seeds, nuts)
- Keep fruit portions moderate

## 4) Cottage cheese + sliced fruit

Choose a lower-sugar fruit option (berries, kiwi, or a small apple) and add nuts for crunch.

---

GlucoForager can help you turn whatever you have at home into diabetes-friendly meal ideas.
""",
            "status": "published",
            "author_name": "GlucoForager Team",
            "published_at": now,
            "created_at": now,
            "updated_at": now,
        },
        {
            "slug": "low-glycemic-snack-swaps",
            "title": "Low-Glycemic Snack Swaps (That Still Taste Good)",
            "excerpt": "Smart swaps that cut sugar spikes—without feeling like you’re missing out.",
            "content": """# Low-Glycemic Snack Swaps (That Still Taste Good)

Snacks can be helpful—especially if long gaps between meals make you feel shaky or over-hungry.
The key is choosing snacks that are **satisfying** and don’t lead to a big sugar spike.

## Snack swap ideas

- Chips → Roasted chickpeas or nuts (portion-controlled)
- Candy → Dark chocolate (small portion) + nuts
- Sweet yogurt → Plain yogurt + berries + cinnamon
- Soda/juice → Sparkling water with lemon/lime
- Crackers → Veg sticks + hummus

## A simple snack formula

Try combining:

- Protein (eggs, yogurt, tuna, chicken, cheese)
- Fiber (veggies, berries, legumes)
- Healthy fat (nuts, avocado, olive oil)

## Portion matters

Even “healthy” snacks can add up. Start with a small portion and see how you feel.

---

Want snack ideas from the ingredients you already have? Try GlucoForager.
""",
            "status": "published",
            "author_name": "GlucoForager Team",
            "published_at": now,
            "created_at": now,
            "updated_at": now,
        },
        {
            "slug": "reading-food-labels-carbs",
            "title": "How to Read Food Labels for Carbs (A Simple Guide)",
            "excerpt": "A quick, practical way to read labels—so you can compare foods confidently.",
            "content": """# How to Read Food Labels for Carbs (A Simple Guide)

Food labels can be confusing at first, but you don’t need to be an expert to make better choices.
Here’s a simple way to read labels when you care about carbs.

## 1) Start with serving size

Most numbers on the label are **per serving**, not per package.
If you eat 2 servings, you’re doubling the carbs, calories, and everything else.

## 2) Check total carbs and fiber

Look at:

- Total carbohydrates
- Dietary fiber

Fiber can help slow digestion, which may support steadier blood sugar.

## 3) Watch added sugars

“Added sugars” tells you how much sugar was added during processing.
Less is generally better, but always consider the full meal.

## 4) Compare similar products

When comparing two options (for example, two breads), check:

- Carbs per serving
- Fiber per serving
- Protein per serving

Higher fiber and protein can help with fullness.

---

GlucoForager can help you build meals around balanced nutrition using the ingredients you already have.
""",
            "status": "published",
            "author_name": "GlucoForager Team",
            "published_at": now,
            "created_at": now,
            "updated_at": now,
        },
        {
            "slug": "meal-planning-blood-sugar-stability",
            "title": "Meal Planning for Steadier Blood Sugar (Beginner-Friendly)",
            "excerpt": "A beginner-friendly approach to planning meals that feel satisfying and more stable.",
            "content": """# Meal Planning for Steadier Blood Sugar (Beginner-Friendly)

Meal planning doesn’t need to be perfect. A simple structure can make it easier to eat consistently.

## A simple plate method

For many people, a balanced plate looks like:

- 1/2 non-starchy vegetables (salad, broccoli, peppers, spinach)
- 1/4 protein (chicken, fish, eggs, tofu, beans)
- 1/4 carbs (whole grains, beans, starchy veg, fruit)
- Add healthy fats (olive oil, nuts, avocado) as needed

## Build “mix and match” meal templates

Pick 2–3 options for each category:

- Proteins: chicken, eggs, tuna
- Veggies: spinach, mixed salad, frozen veg
- Carbs: brown rice, sweet potato, beans
- Sauces: salsa, yogurt-based sauce, olive oil + lemon

Then rotate combinations through the week.

## Plan for your busy days

Keep at least 1–2 fast meals ready:

- Eggs + veggies
- Tuna salad + veg sticks
- Chicken + frozen veg + microwavable grain

---

GlucoForager helps you turn your pantry into diabetes-friendly meal ideas in seconds.
""",
            "status": "published",
            "author_name": "GlucoForager Team",
            "published_at": now,
            "created_at": now,
            "updated_at": now,
        },
    ]

    wanted_slugs = [seed["slug"] for seed in seeds]
    existing = set(
        row[0]
        for row in bind.execute(
            sa.text("SELECT slug FROM blog_posts WHERE slug IN :slugs").bindparams(
                sa.bindparam("slugs", wanted_slugs, expanding=True)
            )
        ).fetchall()
    )
    missing = [seed for seed in seeds if seed["slug"] not in existing]
    if missing:
        op.bulk_insert(blog_posts, missing)


def downgrade() -> None:
    # Keep posts on downgrade (non-destructive).
    return
