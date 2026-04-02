'use client';

import { useMemo } from 'react';
import StructuredText from './StructuredText';

function looksLikeHtml(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (!s.includes('<') || !s.includes('>')) return false;
  // Heuristic: quill typically produces <p>... or tags at the start.
  return /^</.test(s);
}

function sanitizeHtml(html) {
  const input = String(html || '').trim();
  if (!input) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');

    const allowedTags = new Set([
      'P',
      'BR',
      'STRONG',
      'B',
      'EM',
      'I',
      'U',
      'S',
      'A',
      'OL',
      'UL',
      'LI',
      'H1',
      'H2',
      'H3',
      'BLOCKQUOTE',
      'SPAN',
      'DIV',
    ]);

    const walk = (node) => {
      if (!node) return;
      const children = Array.from(node.childNodes || []);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child;
          const tag = String(el.tagName || '').toUpperCase();
          if (!allowedTags.has(tag)) {
            // Replace the element with its children (keeps text content).
            const frag = doc.createDocumentFragment();
            while (el.firstChild) frag.appendChild(el.firstChild);
            el.replaceWith(frag);
            // Continue walking from parent (since we replaced node).
            continue;
          }

          // Strip all attributes except safe ones.
          const attrs = Array.from(el.attributes || []);
          for (const a of attrs) {
            const name = String(a.name || '').toLowerCase();
            if (tag === 'A') {
              if (name === 'href' || name === 'target' || name === 'rel') continue;
            }
            if (name === 'class') continue;
            el.removeAttribute(a.name);
          }

          // Enforce safe link targets.
          if (tag === 'A') {
            const href = String(el.getAttribute('href') || '').trim();
            const safeHref =
              href.startsWith('http://') ||
              href.startsWith('https://') ||
              href.startsWith('mailto:') ||
              href.startsWith('/');
            if (!safeHref) el.removeAttribute('href');
            el.setAttribute('rel', 'noreferrer noopener');
            if (String(el.getAttribute('target') || '').trim() === '_blank') {
              el.setAttribute('target', '_blank');
            } else {
              el.removeAttribute('target');
            }
          }

          // Only allow Quill-style classes.
          if (el.hasAttribute('class')) {
            const cls = String(el.getAttribute('class') || '')
              .split(/\s+/)
              .filter(Boolean)
              .filter((c) => c.startsWith('ql-'));
            if (cls.length) el.setAttribute('class', cls.join(' '));
            else el.removeAttribute('class');
          }

          // Hard drop inline style (XSS surface; quill uses classes).
          if (el.hasAttribute('style')) el.removeAttribute('style');

          walk(el);
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      }
    };

    walk(doc.body);
    return doc.body.innerHTML || '';
  } catch {
    return '';
  }
}

export default function TaskContent({ text, style, className }) {
  const raw = String(text || '');
  const html = useMemo(() => (looksLikeHtml(raw) ? sanitizeHtml(raw) : ''), [raw]);

  if (html) {
    const cls = ['ql-editor', className].filter(Boolean).join(' ');
    return <div className={cls} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <StructuredText text={raw} className={className} style={style} />;
}
