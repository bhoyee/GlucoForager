// utils/idempotency.js

// Not cryptographically unique, just practically unique for one save-attempt on one
// device - timestamp plus a few random base36 chars is plenty for a key the server
// only needs to compare against a single user's own recent submissions.
export function generateIdempotencyKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
