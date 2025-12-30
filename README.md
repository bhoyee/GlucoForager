# GlucoForager

Diabetes-friendly recipe suggestions from the ingredients you already have. Mobile-first with a FastAPI backend, React Native (Expo) mobile app, and a Next.js + Tailwind landing page.

## Structure
- backend: FastAPI + PostgreSQL with recipe matching, auth, and subscription plumbing.
- mobile-app: Expo React Native app with core screens and subscription flow placeholders.
- landing-page: Next.js App Router marketing site with required sections stubbed.

## Development phases
1. Backend core: DB models (users, subscriptions, AI requests), FastAPI app, AI vision/recipe pipeline (OpenAI primary, DeepSeek fallback), auth, abuse detection, caching hooks.
2. Mobile core: Expo setup, key screens, results display, detail view, API layer.
3. Premium features: Camera flow, subscriptions, favorites, profile/history.
4. Landing page: Marketing site with pricing, feature comparison, gallery, and SEO focus.

## AI endpoints (AI-first)
- `POST /api/ai/recipes/vision`: Fridge photo (base64) → ingredients via vision → 3 AI recipes. Tier-aware models and caching.
- `POST /api/ai/text/recipes`: Text ingredient list → 3 AI recipes. Tier-aware models and caching.

## Environment
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_VISION_MODEL` for primary AI.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_VISION_MODEL` for fallback.
- `REDIS_URL` for cache (optional; falls back to in-memory if unavailable).
- SMTP/Resend keys for welcome emails in `backend/.env.example`.

## Running Postgres locally
- Choose a free host port. Default is `65432`. Override when starting compose if needed.
- Spin up DB: `HOST_DB_PORT=65432 docker-compose up -d db` (binds host port → container 5432).
- In `backend/.env`, set `DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:<your_port>/glucoforager` (example uses 65432).

