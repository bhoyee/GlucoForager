import { NextResponse } from 'next/server';

// iOS Universal Links verification file. Must be served at exactly this path,
// over HTTPS, with no redirect - iOS fetches it directly and does not follow
// redirects, which is why this lives on www.glucoforager.com (the canonical
// host - see next.config.js's bare-domain -> www redirect) rather than a path
// that could bounce through one.
//
const TEAM_ID = '857FHF2U7Z';
const BUNDLE_ID = 'com.glucoforager.app';

export function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${TEAM_ID}.${BUNDLE_ID}`,
            paths: ['/resubscribe', '/resubscribe/*'],
          },
        ],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
