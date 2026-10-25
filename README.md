# GlucoForager

**A daily food decision assistant for people living with diabetes.**

GlucoForager answers the question people with diabetes face several times a day: *"What can I eat right now that won't spike my blood sugar?"* Users scan their fridge, type what they have, scan a barcode or a plate of food, and get a clear, personalised answer: a diabetes-friendly verdict, recipe ideas built from their own ingredients, smarter swaps for familiar foods, or a full day's meal plan. They also log glucose readings and meals, see how food actually affects them, and build habits through small daily challenges and tips.

It supports **Type 1, Type 2, prediabetes and gestational diabetes**, and adapts to each user's goals, country, cuisine, foods to avoid, cooking time and kitchen equipment.

- 📱 **Mobile app**: iOS (App Store) and Android (Google Play), bundle id `com.glucoforager.app`
- 🌐 **Website**: [glucoforager.com](https://www.glucoforager.com) (marketing site, blog, pricing)
- 🛠️ **Admin & staff console**: [glucoforager.com/admin](https://www.glucoforager.com/admin)
- ⚙️ **API**: `api.glucoforager.com`

---

## Contents

1. [The problem](#the-problem)
2. [The solution](#the-solution)
3. [Screenshots](#screenshots)
4. [What the app does](#what-the-app-does)
5. [How a user moves through the app](#how-a-user-moves-through-the-app)
6. [Plans: Free, welcome week and Premium](#plans-free-welcome-week-and-premium)
7. [Admin & staff console](#admin--staff-console)
8. [Architecture](#architecture)
9. [AI system](#ai-system)
10. [Error handling & resilience](#error-handling--resilience)
11. [Repository structure](#repository-structure)
12. [Tech stack](#tech-stack)
13. [Running locally](#running-locally)
14. [Testing](#testing)
15. [Deployment & hosting](#deployment--hosting)
16. [Operations: monitoring, backups, scheduled jobs](#operations-monitoring-backups-scheduled-jobs)
17. [Configuration](#configuration)

---

## The problem

Around **589 million adults** live with diabetes worldwide (IDF Diabetes Atlas, 2024), and many more have prediabetes. For all of them, food is the hardest part of daily management:

- **Every meal is a decision.** People are told to "watch carbs" and "eat healthily", but at 7 pm in front of the fridge that advice doesn't say *what to cook tonight with what's actually there*.
- **Generic advice doesn't fit real lives.** Most diet apps and recipe sites ignore the type of diabetes, the person's country and cuisine, their budget, the foods they must avoid and the equipment they own. Advice built for someone else gets abandoned.
- **Labels and portions are confusing.** Knowing whether a packaged food or a plate of food is a good choice means reading nutrition labels, counting carbs and guessing the glucose impact, every time.
- **Cause and effect are invisible.** People log readings in one place and meals in another (or not at all), so they rarely learn *which* of their own foods spike them.
- **Motivation fades.** Long programmes and strict diets feel like punishment, so habits don't stick.

The result is decision fatigue, guesswork, repeated spikes and people giving up on healthier eating.

## The solution

GlucoForager turns diabetes food management into **quick, personal answers at the moment of decision**:

| Problem | How GlucoForager solves it |
|---|---|
| "What can I cook with what I have?" | Scan the fridge or type ingredients → diabetes-friendly recipes built from **those** ingredients, with simple steps and nutrition. |
| "Is this food OK for me?" | Scan a barcode or photo → an instant verdict with carbs, sugar, fibre and a plain-English glucose-impact note. |
| Advice that doesn't fit | Every answer adapts to diagnosis (Type 1, Type 2, prediabetes, gestational), goals, country, cuisine, foods to avoid, cooking time and equipment. |
| Giving up familiar foods | Food swaps keep the foods people love, with smarter versions instead of bans. |
| Not knowing what affects *me* | Glucose and meal logging in one place, spike alerts, and insights built only from the user's own data. |
| Decision fatigue across the day | A daily carb goal, a daily meal planner and "what can I eat now?" suggestions. |
| Habits that don't stick | One small daily challenge that ticks itself when the user does it, plus short daily tips that turn personal twice a week. |

It's priced to be accessible: core tracking is free forever, AI features have weekly free uses, and new users get a 7-day Premium welcome week with no card required.

## Screenshots

| Home | Food scan verdict | Type ingredients | Recipe results |
|:---:|:---:|:---:|:---:|
| <img src="landing-page/public/screenshots/home-screen.jpeg" width="200" alt="Home screen with carb ring, challenge and quick actions"> | <img src="landing-page/public/screenshots/food-scan-verdict.png" width="200" alt="Food scan verdict"> | <img src="landing-page/public/screenshots/type-ingredients.png" width="200" alt="Typing ingredients"> | <img src="landing-page/public/screenshots/recipe-result.jpeg" width="200" alt="Recipe results"> |
| **Food swaps** | **GlucoGuide AI** | **Glucose logging** | **Daily carb goal** |
| <img src="landing-page/public/screenshots/food-swaps.png" width="200" alt="Food swaps"> | <img src="landing-page/public/screenshots/glucoguide-ai.png" width="200" alt="GlucoGuide AI chat"> | <img src="landing-page/public/screenshots/glucose-logging.png" width="200" alt="Glucose logging"> | <img src="landing-page/public/screenshots/carb-goal.png" width="200" alt="Daily carb goal ring"> |
| **Daily meal planner** | **Shopping list** | **Favourites & history** | **Profile** |
| <img src="landing-page/public/screenshots/daily-meal-planner.png" width="200" alt="Daily meal planner"> | <img src="landing-page/public/screenshots/shopping-list.jpeg" width="200" alt="Shopping list"> | <img src="landing-page/public/screenshots/favorites-history.jpg" width="200" alt="Favourites and history"> | <img src="landing-page/public/screenshots/profile.jpeg" width="200" alt="Profile"> |

---

## What the app does

### Know before you eat
| Feature | What it does |
|---|---|
| **Barcode & photo food scan** | Scan a product barcode or photograph any food or meal for an instant diabetes-friendly verdict, with carbs, sugar and fibre, plus a simple glucose-impact explanation. |
| **"What can I eat now?"** | Quick suggestions for the moment a user needs an answer immediately, based on their profile and time of day. |
| **GlucoGuide AI** | A chat assistant for everyday food questions: "is this OK?", plate balance, swaps, eating out. Answers are aware of the user's profile, favourites and plans. |

### Cook with what you have
| Feature | What it does |
|---|---|
| **Fridge / pantry scan** | Photograph a fridge or cupboard; the app identifies usable ingredients, lets the user review them, then generates recipes. |
| **Type ingredients** | No photo needed: type what you have and get recipe ideas. Ingredients are checked first (non-food and additive-only lists are rejected with a clear message). |
| **Recipe results & details** | Diabetes-friendly recipes with realistic food photos, nutrition estimates (calories, carbs, protein, fibre), glucose-impact notes and simple steps. |
| **Start cooking mode** | Step-by-step cooking view designed to be followed in the kitchen. |
| **Recipe library** | Browse the growing bank of approved recipes, with filters, alongside the user's own recent recipes. |
| **Favourites & recent history** | Save meals and revisit past results, so what works becomes easy to repeat. |
| **Shopping list** | Build a list from scratch or straight from a recipe; tick items off while shopping. |

### Better choices for familiar foods
| Feature | What it does |
|---|---|
| **Food swaps** | Smarter alternatives for snacks, drinks and common foods, each with a realistic photo and the reason it's better. |
| **Carb swaps** | Lower-carb swaps for everyday staples. |

### Plan the day
| Feature | What it does |
|---|---|
| **Daily meal planner** (Premium) | Breakfast, lunch, dinner and snacks that fit the user's profile, preferences and carb goal. |
| **Daily carb goal** | A personalised daily carb target shown as a ring on the home screen, filled automatically as meals are logged. |

### Track how food affects *you*
| Feature | What it does |
|---|---|
| **Glucose log** | Log readings (before/after meals, fasting, bedtime) against personal targets for the user's diagnosis. Hypo-aware guidance for low readings. |
| **Meal / food log** | Log meals with carb estimates; links to readings so food impact can be measured. |
| **Spike alerts** | Flags a reading that rose more than expected after a meal. |
| **Glucose insights** | Trends, food impact and time-of-day patterns built only from the user's own data, always showing the counts behind each insight ("3 of 3 times"). |
| **Weekly recap** | A summary of the week: readings in range, meals logged, challenges done. |

### Build habits
| Feature | What it does |
|---|---|
| **Daily challenge** | One small action a day (for example a walk after dinner or a fibre swap). Tasks **tick themselves** when the user logs a matching meal, reading, recipe or plan, and up to 3 tasks a day can be swapped. Streaks and nudges keep momentum. |
| **Daily guidance / tip of the day** | Short, practical tips matched to the profile. Twice a week the tip is **personal**, built from the user's own logged meals and readings (e.g. comparing two foods they eat), rotating through different foods each time. A tips archive keeps past tips. |

### App experience
- Onboarding that captures diagnosis, goals, country, cuisine, preferences, equipment and foods to avoid (all editable later in Profile).
- Regional pricing and currency display, and a branded splash screen.
- Over-the-air updates: the app checks for a new update on launch, so most fixes reach users without a store release.
- Push notifications (Expo) for challenges, streaks and campaigns.
- Offline-friendly status banner when the service is down (fed by the status worker).

**Bottom tabs:** Home · Scan · Favourites · Daily plan · Guide (GlucoGuide) · Profile

---

## How a user moves through the app

![How a user moves through GlucoForager: install, onboarding, welcome week, home, then food scan, fridge scan, typed ingredients, food swaps and logging, leading to insights, weekly recap and personal tips](docs/user-flow.png)

**Recipe generation flow (fast path):**
1. Ingredients are validated (food check, additive-only check, cached approval for ingredients that came from a recent scan).
2. The **recipe bank** is checked first: approved recipes matching the user's ingredients are served instantly.
3. If more are needed, the AI produces recipe **cards first**, then fills in the details for each in parallel, and the app shows results as they arrive.
4. Photos come from a shared **food photo library**; missing ones are generated once and reused for everyone.
5. New recipes that pass the quality gate (nutrition checks, near-duplicate check) join the bank for future users.

---

## Plans: Free, welcome week and Premium

| | Free | Welcome week | Premium |
|---|---|---|---|
| Who | Everyone after the welcome week | New users, first 7 days, no card | Store subscription (or admin-granted) |
| Logging, insights, challenges, tips, favourites, shopping list | ✅ | ✅ | ✅ |
| AI features: GlucoGuide, fridge scan, recipe generation, food scan, swaps | **3 free uses each per week** (resets Monday 00:00 UTC) | Unlimited | Unlimited |
| Daily meal planner | ❌ | ✅ | ✅ |

- A free use is only counted **after the AI call succeeds**, so failures never cost a use.
- Weekly limits and the welcome-week length are **editable in the admin console**; a limit of 0 makes a feature Premium-only.
- Subscriptions run through the App Store / Google Play via **RevenueCat**, with webhooks keeping the backend in sync. Lapsed-payment ("dunning") and win-back flows exist; lifecycle emails are switched off unless explicitly enabled.

---

## Admin & staff console

Next.js app under `landing-page/app/admin/`, with **role-based access** (Admin, HR, Operations, Marketer and more). Sessions use short-lived JWTs with automatic refresh; expired sessions redirect cleanly to sign-in.

| Area | Pages |
|---|---|
| **Product & users** | Users (plans, welcome week, free usage, lapsed cards), user email, recipes (bank, sources, approval), challenge, tips, mobile logs |
| **Growth & marketing** | Push campaigns, newsletter, win-back, blog (scheduling, SEO), reports |
| **Settings** | Free weekly allowances, welcome-week length and other feature switches |
| **Staff operations** | Staff & roles, my team, attendance (clock in/out), work plans & milestones, scheduled tasks, daily work logs, stand-up notes, requests & approvals, expenses, payroll / my payroll |
| **Communication** | Inbox, help tickets, notifications with badge counts, intranet updates |
| **Files** | Library, my drive, staff drive |
| **System** | System health (disk, CPU, memory, services), system logs, audit trail, database backups (download/restore) |

---

## Architecture

A **modular monolith**: one FastAPI backend and one PostgreSQL database, with **queue-driven background workers** for slow AI work.

![GlucoForager architecture: mobile app and website/admin over HTTPS to edge-nginx, then the FastAPI API and the background worker, backed by PostgreSQL, Redis and file storage, calling OpenAI/Gemini, Runware, Cloudflare R2, Resend, RevenueCat and Expo](docs/architecture.png)

**Why this shape**
- **Async AI, fast API.** AI calls can take 10–60 s and may be rate-limited. Requests create an `ai_jobs` row and return at once; workers do the work and the app polls. The API never blocks on a model.
- **Redis Streams, not Kafka/RabbitMQ.** Light enough for a small server and shared with caching/rate limits. Job state lives in Postgres, so the queue can be swapped later without touching business logic.
- **One database.** Strong consistency for subscriptions, approvals, payroll and audit; no distributed transactions.
- **Room to grow.** API and workers scale independently (more replicas, tuned `AI_JOB_RUNNER_*` pools); AI could become its own service later because it is already job-based.

---

## AI system

- **Queue backends:** `AI_QUEUE_BACKEND=redis` (recommended, `backend/app/workers/ai_jobs.py`) or `db` (in-process runner using `SKIP LOCKED`, `backend/app/services/ai_job_runner.py`).
- **Bounded parallelism:** separate pools for text and vision (`AI_JOB_RUNNER_TEXT_WORKERS`, `AI_JOB_RUNNER_VISION_WORKERS`). Stuck vision jobs are rescued with a delayed retry and an atomic claim.
- **Providers:** primary + fallback models with strict timeouts, JSON-mode output and validation; failures are classified as *operational* (retry/try later) or *invalid input* (clear message to the user).
- **Guards before spending tokens:** ingredient food check and diabetes-friendly classifier, additive-only rejection, rate limits, daily caps, free-tier allowance and abuse detection. Every AI request is cost-tracked.
- **Recipe bank** (`recipe_bank.py`, `recipe_keys.py`): approved recipes indexed by ingredient keys (GIN index) and served before calling AI; quality gate, near-duplicate check and nutrition sanity checks before a recipe is stored.
- **Food photo library** (`food_image_library.py`): one shared, realistic photo per food/recipe stored in R2, generated with Runware (Gemini fallback) only when missing.

---

## Error handling & resilience

The goal: **users always get a clear message, never a crash or a silent failure, and every problem is visible to the team.**

### Backend (FastAPI)
| Situation | What happens |
|---|---|
| Invalid request body | Global `RequestValidationError` handler returns a clean `422` and records the details in the system log. |
| Expected errors (not found, forbidden, limit reached…) | Raised as `HTTPException` with a user-readable `detail` that the app shows as-is. |
| Database unreachable | Middleware catches it and returns `503 "Database temporarily unavailable"` instead of a stack trace. |
| Any unexpected exception | Caught by a catch-all handler → `500 "Internal server error"` for the user, full error logged for the team. |
| Too many requests | Per-minute rate limiting returns `429` with a `Retry-After` header; AI features also have per-user daily caps. Login attempts are throttled. |
| AI provider slow, down or rate-limited | Strict timeouts, then a fallback model/provider. The job fails cleanly with an **operational** reason ("try again shortly") and is never charged against the user's free uses. |
| AI input can't work ("only additives", "not food", nutrition missing) | Rejected **before** spending AI tokens, with an **invalid input** reason telling the user exactly what to change. |
| AI returns malformed output | JSON-mode responses are validated (nutrition numbers, ingredient match, duplicates); a bad result is retried once, then rejected rather than shown. |
| Worker crash mid-job | Jobs live in Postgres, so a stuck job is detected and rescued with an atomic claim (no double processing). |
| Duplicate submissions (double taps, retries on bad networks) | Glucose readings, meals and plans carry a client-generated **idempotency key**; the server ignores repeats. |

All warnings and errors go to the **System logs** page in the admin console (path, method, status, details), with noise from internet scanners filtered out. Staff actions go to the **Audit** log.

### Mobile app
- **Timeouts everywhere:** every API call has a timeout (10 s default) and one automatic retry with a longer timeout on network failure.
- **Silent session refresh:** an expired token is refreshed and the request retried once; only if that fails is the user asked to sign in again.
- **Friendly messages:** server `detail` messages are shown directly; `429` responses tell the user how many seconds to wait.
- **Outage banner:** a Cloudflare Worker checks the API every minute, independently of the server, so the app can show "we're having issues" even when the API is unreachable, including on the login screen.
- **Remote diagnostics:** client-side errors are buffered on the device and uploaded to the backend, where they appear on the admin **Mobile logs** page.
- **Safe updates:** OTA updates are checked on launch with a short fallback timeout, so a slow network never blocks the app from opening.

### Admin console
- Expired sessions are detected locally (JWT expiry), refreshed once for all parallel requests, and redirected to sign-in with a clear "session expired" message, with no burst of failing requests.

---

## Repository structure

```
GlucoForager/
├── Mobile-GApp/                 Expo React Native app
│   ├── App.js, app.json, eas.json   app config, version, EAS build/update channels
│   ├── screens/                 one file per screen (Home, Scan*, Recipe*, DailyPlan,
│   │                            GlucoGuide, LogGlucose, FoodLog, GlucoseInsights,
│   │                            Challenge, TodayTip, WeeklyRecap, ShoppingList, Profile…)
│   ├── navigation/              tab + stack navigators
│   ├── components/              shared UI (GlucoseImpactCard, KeyboardAwareScrollView…)
│   ├── context/, utils/, config/, constants/, assets/
│
├── backend/                     FastAPI service
│   ├── app/
│   │   ├── main.py              app setup, middleware, startup schedulers
│   │   ├── api/endpoints/       routes: app_* (mobile), admin_* (console), auth, recipes,
│   │   │                        text_recipes, ai_recipes, meal_plan, shopping_list,
│   │   │                        revenuecat, webhooks…
│   │   ├── services/            business logic: AI pipeline, recipe bank, swaps, glucose
│   │   │                        insights, challenges, tips, free tier, subscriptions,
│   │   │                        storage (local/FTP/R2), email, push, schedulers…
│   │   ├── workers/ai_jobs.py   Redis Streams AI worker
│   │   ├── models/              SQLAlchemy models
│   │   └── core/, data/, assets/
│   ├── alembic/                 database migrations
│   ├── tests/                   unittest suite
│   └── Dockerfile, requirements.txt, .env.example
│
├── landing-page/                Next.js (App Router) + Tailwind
│   ├── app/                     marketing pages, blog, pricing, legal, sitemap/robots
│   ├── app/admin/               admin & staff console (see above)
│   └── components/, lib/, public/
│
├── status-worker/               Cloudflare Worker: uptime check + /status for the app
├── docs/                        architecture diagram
├── .github/workflows/           CI/CD and ops workflows (see below)
└── docker-compose.yml           api, worker, db (Postgres 15), redis (7)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 54, React Native 0.81 (new architecture), React 19, EAS Build/Submit/Update |
| Backend | Python 3.11, FastAPI, SQLAlchemy, Alembic, APScheduler |
| Data | PostgreSQL 15, Redis 7 (Streams, cache, rate limits) |
| AI | OpenAI (GPT-4.1 family) with Gemini fallback; Runware / Gemini for food images |
| Web & admin | Next.js 14 (App Router), React 18, Tailwind CSS |
| Storage | Cloudflare R2 (photos, uploads, backups), local disk or FTP per module |
| Payments | RevenueCat (App Store / Google Play subscriptions) |
| Email & push | Resend, Expo push notifications |
| Hosting | Oracle Cloud (API, worker, DB, Redis in Docker behind nginx), Vercel (website/admin), Cloudflare Workers (status) |

---

## Running locally

**Requirements:** Docker, Node 18+, Python 3.11 (only for running tests outside Docker).

```bash
# 1. Backend: API, worker, Postgres, Redis
cp backend/.env.example backend/.env      # fill in keys you need
docker compose up -d --build
docker compose run --rm api alembic upgrade head
# API → http://localhost:8011   (docs at /docs)

# 2. Website + admin
cd landing-page && npm install
NEXT_PUBLIC_API_URL=http://localhost:8011 npm run dev   # http://localhost:3000

# 3. Mobile app (needs a dev client build)
cd Mobile-GApp && npm install
npx expo start --dev-client
```

Inside Docker, services reach each other as `db:5432` (Postgres) and `redis:6379`.

---

## Testing

| Suite | Tool | Size | Location |
|---|---|---|---|
| Backend unit & integration tests | Python `unittest` | 126 tests, 17 files | `backend/tests/` |
| Mobile logic tests | Jest | 32 tests, 6 files | `Mobile-GApp/utils/__tests__/` |

### What is covered
**Backend**
| Area | Test file(s) |
|---|---|
| Plans & access: free weekly uses, welcome week, trial access, feature usage | `test_free_tier_service.py`, `test_feature_usage.py`, `test_trial_access_service.py`, `test_dependencies.py` |
| Payments: dunning only for paying users | `test_dunning_paid_only.py` |
| Glucose: targets per diagnosis, impact verdicts, insights and patterns | `test_glucose_targets.py`, `test_glucose_impact.py`, `test_glucose_insights.py` |
| Food & meals: label reading, additive-only rejection, carb estimates, meal diary, meal options | `test_food_label.py`, `test_label_additives.py`, `test_meal_carb_estimate.py`, `test_meal_diary.py`, `test_recipe_meal_options.py` |
| Habits: daily challenge auto-tick and swaps, personal tip rotation | `test_daily_challenge_service.py`, `test_tip_rotation.py` |
| Platform: country detection for pricing, durable recipe images | `test_geo_country.py`, `test_recipe_image_durable.py` |

**Mobile:** after-meal check timing, free-tier display, glucose reading classification, recipe image cache, scan tracking and today's tips.

### Running the tests
Backend: run against a **separate test database**, never production:

```bash
cd backend
TEST_DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:15432/gf_tests \
DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:15432/gf_tests \
REDIS_URL=redis://localhost:6379/9 \
python -m unittest discover -s tests -t .
```

Mobile:

```bash
cd Mobile-GApp
npm test
```

### Quality gates
- **CI:** every backend deploy compile-checks the code first and stops if it fails.
- **Migrations:** schema changes go through Alembic and run automatically on deploy.
- **Manual QA:** new features are tested end to end on a dev build against a local test stack before release; production gets OTA updates only after that.

---

## Deployment & hosting

| What | How |
|---|---|
| **Backend** | Push to `main` (backend paths) → `deploy-backend.yml` compile-checks, then SSHes to the server, resets to `origin/main`, rebuilds with `docker compose up -d --build`, runs `alembic upgrade head` and reloads `edge-nginx`. |
| **Website & admin** | Vercel builds `landing-page/` on push to `main`. |
| **Mobile OTA update** | `eas-update.yml` (manual) publishes a JS update to production; can target the current or previous app version. |
| **Mobile store build** | `eas build` / `eas submit` (iOS → App Store Connect, Android `.aab` → Play Console); `eas-android.yml` for Android builds. |

**Branching:** work happens on `dev`; `main` is production. Merging `dev` → `main` deploys.

**Server:** an Oracle Cloud Always Free Ampere A1 VM (2 OCPU / 12 GB, Ubuntu 24.04, ARM64) runs the Docker stack behind `edge-nginx` with Let's Encrypt certificates (certbot, webroot). Hosting cost is **£0**; a monthly budget alert warns if anything would ever start costing money.

---

## Operations: monitoring, backups, scheduled jobs

**Monitoring**
- `status-worker/` (Cloudflare Worker) checks `/health` every minute, emails on outage and serves `/status` for the app's service banner.
- Admin **System health** shows disk, CPU, memory and service status; **System logs** and **Audit** record errors and staff actions.

**Backups**
- The API writes a database dump daily at 02:00 UTC; a cron job uploads it to Cloudflare R2 at 02:10, keeps 7 days (never fewer than 3) and emails if anything fails. Backups can also be downloaded from the admin console.

**Scheduled jobs (inside the API)**
Database backup · work-plan task reveal & notifications · user-activity cleanup (60 days) · soft-deleted account removal (3 days) · recipe bank auto-generation · streak nudges · welcome-week and dunning emails (off unless enabled).

**Ops workflows (`.github/workflows/`)**
| Workflow | Purpose |
|---|---|
| `deploy-backend.yml` | Deploy backend to the server |
| `eas-update.yml`, `eas-android.yml` | Mobile OTA updates and Android builds |
| `oci-audit.yml` | Read-only check of the Oracle account against Always Free limits; optional budget alert setup |
| `oci-a1-retry.yml` | Capacity hunt for an Always Free A1 VM (disables itself on success) |
| `run-backfill.yml`, `check-backfill-log.yml` | One-off data backfills and their logs |
| `check-proxy-ip.yml` | Network diagnostics |

---

## Configuration

- **Backend:** copy `backend/.env.example` → `backend/.env`. Key groups: database/Redis URLs, AI keys and models, `AI_QUEUE_BACKEND` and worker pool sizes, image provider (`RECIPE_IMAGE_PROVIDER`), storage backends per module (`*_STORAGE_BACKEND=local|ftp|r2` + `R2_*`), email (Resend), RevenueCat, push, scheduler switches.
- **Website/admin:** `NEXT_PUBLIC_API_URL` points at the API.
- **Mobile:** `Mobile-GApp/app.json` (version, build numbers, OTA settings) and `eas.json` (development / preview / production channels).

> Never commit `.env` files or keystores; they are git-ignored.
