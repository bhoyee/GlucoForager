// GlucoForager status monitor.
//
// Runs on Cloudflare (independent of the Oracle server) so it keeps working
// when the backend is down:
//   - cron: checks HEALTH_URL every minute, emails admins on down/restore
//   - GET /status: tiny JSON the mobile app reads to show an outage banner
//
// KV keys:
//   state   - { status, failures, since, downSince } (written only on change,
//             to stay well under the free-tier KV write limit)
//   notice  - optional manual override, e.g. planned maintenance:
//             npx wrangler kv key put --binding STATUS notice '{"status":"maintenance","message":"..."}' --remote

const DEFAULT_STATE = { status: 'up', failures: 0, since: null, downSince: null };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function readState(env) {
  const raw = await env.STATUS.get('state');
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function checkHealth(url) {
  try {
    // Never let Cloudflare serve a cached /health: a stale 200 would hide a real outage.
    // (cf.cacheTtl must NOT be used here - it forces caching rather than disabling it.)
    const bust = `${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const res = await fetch(url + bust, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: { 'User-Agent': 'glucoforager-status-worker', 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    if (body?.status !== 'ok') return { ok: false, detail: 'unexpected /health body' };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err?.name === 'TimeoutError' ? 'timed out after 10s' : String(err?.message || err) };
  }
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

async function sendAlert(env, subject, text) {
  if (!env.RESEND_API_KEY || !env.ALERT_TO) {
    console.log('Alert not sent (RESEND_API_KEY/ALERT_TO missing):', subject);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ALERT_FROM,
      to: env.ALERT_TO.split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      text,
    }),
  });
  if (!res.ok) console.log('Resend error', res.status, await res.text());
}

async function runCheck(env) {
  const state = await readState(env);
  const threshold = Number(env.FAILURES_BEFORE_DOWN || 3);
  const now = new Date().toISOString();
  const result = await checkHealth(env.HEALTH_URL);

  if (result.ok) {
    if (state.status === 'down') {
      const took = formatDuration(Date.now() - Date.parse(state.downSince));
      await env.STATUS.put('state', JSON.stringify({ status: 'up', failures: 0, since: now, downSince: null }));
      await sendAlert(
        env,
        `✅ GlucoForager API restored (down ${took})`,
        `The API at ${env.HEALTH_URL} is responding again.\n\nDown since: ${state.downSince}\nRestored: ${now}\nOutage length: ${took}`
      );
    } else if (state.failures > 0) {
      // Recovered before reaching the threshold: just reset the counter.
      await env.STATUS.put('state', JSON.stringify({ ...state, failures: 0 }));
    }
    return;
  }

  const failures = state.failures + 1;
  if (state.status === 'up' && failures >= threshold) {
    // First failed check was (threshold - 1) minutes ago.
    const downSince = new Date(Date.now() - (threshold - 1) * 60000).toISOString();
    await env.STATUS.put('state', JSON.stringify({ status: 'down', failures, since: now, downSince }));
    await sendAlert(
      env,
      '🔴 GlucoForager API is DOWN',
      `${env.HEALTH_URL} failed ${failures} checks in a row.\n\nLast error: ${result.detail}\nDown since: about ${downSince}\n\nThe mobile app is now showing the outage banner. You'll get another email when it recovers.`
    );
  } else if (state.status === 'up') {
    await env.STATUS.put('state', JSON.stringify({ ...state, failures }));
  }
  // Already down: nothing to write; avoid burning KV writes every minute.
}

async function statusResponse(env) {
  const [state, noticeRaw] = await Promise.all([readState(env), env.STATUS.get('notice')]);
  let notice = null;
  try {
    notice = noticeRaw ? JSON.parse(noticeRaw) : null;
  } catch {
    notice = null;
  }

  const body = {
    status: notice?.status || state.status, // 'up' | 'down' | 'maintenance'
    message:
      notice?.message ||
      (state.status === 'down'
        ? "GlucoForager is temporarily unavailable. We're working on it — please try again shortly."
        : null),
    since: state.status === 'down' ? state.downSince : state.since,
    checkedAt: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
  });
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCheck(env));
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const { pathname } = new URL(request.url);
    if (pathname === '/status' || pathname === '/') return statusResponse(env);
    return new Response('Not found', { status: 404, headers: CORS });
  },
};
