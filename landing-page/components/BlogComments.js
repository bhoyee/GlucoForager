'use client';

import { useMemo, useState } from 'react';
import { formatDMY } from '../lib/formatDate';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export default function BlogComments({ slug, initialComments = [] }) {
  const [comments, setComments] = useState(Array.isArray(initialComments) ? initialComments : []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && content.trim().length >= 2 && !busy;
  }, [name, content, busy]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          content: content.trim(),
        }),
      });
      if (!response.ok) throw new Error();
      setName('');
      setEmail('');
      setContent('');
      setMessage('Thanks! Your comment was submitted and will appear once approved.');
    } catch (error) {
      setMessage('Could not submit your comment right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/blog/posts/${encodeURIComponent(slug)}/comments`, {
        cache: 'no-store',
      });
      const data = await response.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage('Could not refresh comments.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 border-t border-gray-200 pt-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Comments</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy}
          className="text-sm font-semibold text-teal-700 hover:text-teal-800"
        >
          Refresh
        </button>
      </div>

      {comments.length === 0 ? (
        <p className="text-gray-600">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-gray-900">{comment.name}</p>
                {comment.created_at ? (
                  <p className="text-xs text-gray-500">
                    {formatDMY(comment.created_at)}
                  </p>
                ) : null}
              </div>
              <p className="mt-2 text-gray-700 whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Add a comment</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email (optional)"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
              type="email"
            />
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write your comment..."
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
            required
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-teal-600 px-5 py-3 text-white font-semibold disabled:opacity-50"
          >
            {busy ? 'Submitting...' : 'Submit comment'}
          </button>
        </form>
        {message ? <p className="mt-3 text-sm text-gray-600">{message}</p> : null}
      </div>
    </section>
  );
}
