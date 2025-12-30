# GlucoForager

Diabetes-friendly recipe suggestions from the ingredients you already have. Mobile-first with a FastAPI backend, React Native (Expo) mobile app, and a Next.js + Tailwind landing page.

## Structure
- backend: FastAPI + PostgreSQL with recipe matching, auth, and subscription plumbing.
- mobile-app: Expo React Native app with core screens and subscription flow placeholders.
- landing-page: Next.js App Router marketing site with required sections stubbed.

## Development phases
1. Backend core: DB models, FastAPI app, recipe matching, auth, AI vision/recipe stubs, abuse detection.
2. Mobile core: Expo setup, key screens, results display, detail view, API layer.
3. Premium features: Camera flow, subscriptions, favorites, profile/history.
4. Landing page: Marketing site with pricing, feature comparison, gallery, and SEO focus.

## AI endpoints (Phase 1 refresh)
- `POST /api/ai/vision`: GPT-5 Vision-style fridge analysis (base64 image). Returns detected ingredients (mocked if no API key).
- `POST /api/ai/recipes/generate`: GPT-5 recipe generation with diabetes-friendly prompt, enforces daily search limits.

## Environment
- Add `OPENAI_API_KEY`, `OPENAI_MODEL` (default gpt-5), `OPENAI_VISION_MODEL` (default gpt-5-vision) for AI.
- SMTP/Resend keys for welcome emails are in `backend/.env.example`.

## Running Postgres locally
- Choose a free host port. Default is `65432`. Override when starting compose if needed.
- Spin up DB: `HOST_DB_PORT=65432 docker-compose up -d db` (binds host port → container 5432).
- In `backend/.env`, set `DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:<your_port>/glucoforager` (example uses 65432).

