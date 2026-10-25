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

1. [What the app does](#what-the-app-does)
2. [How a user moves through the app](#how-a-user-moves-through-the-app)
3. [Plans: Free, welcome week and Premium](#plans-free-welcome-week-and-premium)
4. [Admin & staff console](#admin--staff-console)
5. [Architecture](#architecture)
6. [AI system](#ai-system)
7. [Repository structure](#repository-structure)
8. [Tech stack](#tech-stack)
9. [Running locally](#running-locally)
10. [Testing](#testing)
11. [Deployment & hosting](#deployment--hosting)
12. [Operations: monitoring, backups, scheduled jobs](#operations-monitoring-backups-scheduled-jobs)
13. [Configuration](#configuration)

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

The backend has a `unittest` suite in `backend/tests/` (recipe bank, label/additive checks, tip rotation, challenges and more). Run it against a **separate test database**, never production:

```bash
cd backend
TEST_DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:15432/gf_tests \
DATABASE_URL=postgresql://glucoforager:glucoforager@localhost:15432/gf_tests \
REDIS_URL=redis://localhost:6379/9 \
python -m unittest discover -s tests -t .
```

CI runs a compile check of the backend on every deploy.

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
