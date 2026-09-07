import { NextResponse } from 'next/server';

// Android App Links verification file - same purpose as apple-app-site-association,
// served at the canonical www host for the same no-redirect reason.
//
// This is the EAS-managed upload keystore's fingerprint. If Google Play App
// Signing is enabled for this app (Play Console -> Setup -> App integrity),
// Google re-signs the app with its own certificate before distributing it, and
// THAT fingerprint - not this one - is what needs to be here. Verify against
// Play Console -> App integrity -> App signing key certificate before relying
// on this.
const SHA256_CERT_FINGERPRINT =
  '03:CA:EC:53:D2:A3:E7:91:3F:72:CD:22:58:4A:3F:26:4A:8F:42:80:C7:50:7F:20:4B:F8:FE:2B:05:F4:87:5B';
const PACKAGE_NAME = 'com.glucoforager.app';

export function GET() {
  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: [SHA256_CERT_FINGERPRINT],
        },
      },
    ],
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
