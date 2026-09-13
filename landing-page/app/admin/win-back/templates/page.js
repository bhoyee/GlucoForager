'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

const STAGE_LABEL = {
  day0: 'Day 0 - sent the moment Premium ends',
  day7: 'Day 7 - one week later',
  day14: 'Day 14 - two weeks later',
  day21: 'Day 21 - three weeks later, last weekly note',
  monthly: 'Monthly - every 30 days after that',
};

const parseErrorResponse = async (response) => {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    return data?.message || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
};

function TemplateCard({ template, token, onSaved, router }) {
  const [subject, setSubject] = useState(template.subject);
  const [heading, setHeading] = useState(template.heading);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const isDirty = subject !== template.subject || heading !== template.heading || bodyHtml !== template.body_html;

  const handleSave = async () => {
    if (!token || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/admin/dunning/templates/${template.stage}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, heading, body_html: bodyHtml }),
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setError(await parseErrorResponse(response));
        return;
      }
      const data = await response.json();
      onSaved(data);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setError('Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-card" style={{ marginBottom: 18 }}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="admin-title" style={{ fontSize: 17 }}>
            {STAGE_LABEL[template.stage] || template.stage}
          </h3>
          {template.updated_at ? (
            <p className="admin-subtitle" style={{ fontSize: 12 }}>
              Last edited {new Date(template.updated_at).toLocaleString()}
              {template.updated_by ? ` by ${template.updated_by}` : ''}
            </p>
          ) : null}
        </div>
        {savedFlash ? <span style={{ color: '#0d9488', fontWeight: 700, fontSize: 13 }}>Saved</span> : null}
      </div>

      {error ? <div className="admin-message admin-message-error">{error}</div> : null}

      <div style={{ marginTop: 12 }}>
        <label className="admin-subtitle" style={{ display: 'block', marginBottom: 4 }}>
          Subject line
        </label>
        <input
          className="admin-search-input"
          style={{ width: '100%' }}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="admin-subtitle" style={{ display: 'block', marginBottom: 4 }}>
          Heading (shown at the top of the email)
        </label>
        <input
          className="admin-search-input"
          style={{ width: '100%' }}
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="admin-subtitle" style={{ display: 'block', marginBottom: 4 }}>
          Body (HTML) - use <code>{'{{name}}'}</code> where the recipient's first name should go
          {template.stage === 'day0' ? (
            <>
              , and <code>{'{{usage_summary}}'}</code> for a real sentence about what they actually did
              recently (e.g. &quot;You generated 9 recipes and logged 14 meals recently&quot;)
            </>
          ) : null}
        </label>
        <textarea
          className="admin-search-input"
          style={{ width: '100%', minHeight: 160, fontFamily: 'monospace', fontSize: 13 }}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />
      </div>

      <div className="admin-inline" style={{ justifyContent: 'flex-end', gap: 12, marginTop: 14 }}>
        <button
          type="button"
          className="admin-button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function AdminWinBackTemplatesPage() {
  const router = useRouter();
  const token = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('adminToken');
  }, []);

  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      router.push('/admin');
      return;
    }
    setIsLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/admin/dunning/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!response.ok) {
        setMessage(await parseErrorResponse(response));
        return;
      }
      const data = await response.json();
      setTemplates(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('Failed to load templates.');
    } finally {
      setIsLoading(false);
    }
  }, [token, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = (updated) => {
    setTemplates((prev) => prev.map((t) => (t.stage === updated.stage ? updated : t)));
  };

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="admin-title">Win-Back Email Templates</h2>
            <p className="admin-subtitle">
              Edit any of the 5 win-back emails below. Saving takes effect immediately - the next scheduled send
              for that stage uses whatever is saved here, no deploy needed.
            </p>
          </div>
          <Link className="admin-link" href="/admin/win-back">
            View Sent History
          </Link>
        </div>
        {message ? <div className="admin-message admin-message-error">{message}</div> : null}
      </div>

      {isLoading ? (
        <p className="admin-loading">Loading templates...</p>
      ) : (
        templates.map((template) => (
          <TemplateCard key={template.stage} template={template} token={token} onSaved={handleSaved} router={router} />
        ))
      )}
    </div>
  );
}
