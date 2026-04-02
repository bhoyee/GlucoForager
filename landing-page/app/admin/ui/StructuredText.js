'use client';

import { useMemo } from 'react';

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitBlocks(text) {
  const lines = normalizeNewlines(text).split('\n');
  const blocks = [];
  let current = [];
  for (const rawLine of lines) {
    const line = String(rawLine ?? '');
    if (!line.trim()) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function isUnorderedLine(line) {
  return /^(\s*[-*•])\s+/.test(line);
}

function isOrderedLine(line) {
  return /^(\s*\d+)\.\s+/.test(line);
}

function stripUnorderedPrefix(line) {
  return line.replace(/^(\s*[-*•])\s+/, '');
}

function stripOrderedPrefix(line) {
  return line.replace(/^(\s*\d+)\.\s+/, '');
}

function renderInlineWithBreaks(lines) {
  return lines.map((l, idx) => (
    <span key={idx}>
      {l}
      {idx < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

export default function StructuredText({ text, className, style }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);

  if (!String(text || '').trim()) return null;

  return (
    <div className={className} style={style}>
      {blocks.map((block, bi) => {
        const allUnordered = block.every((l) => isUnorderedLine(l));
        const allOrdered = block.every((l) => isOrderedLine(l));

        if (allUnordered) {
          return (
            <ul key={bi} style={{ margin: bi === 0 ? 0 : '10px 0 0', paddingLeft: 18 }}>
              {block.map((l, li) => (
                <li key={li} style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                  {stripUnorderedPrefix(l).trim()}
                </li>
              ))}
            </ul>
          );
        }

        if (allOrdered) {
          return (
            <ol key={bi} style={{ margin: bi === 0 ? 0 : '10px 0 0', paddingLeft: 18 }}>
              {block.map((l, li) => (
                <li key={li} style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                  {stripOrderedPrefix(l).trim()}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={bi} style={{ margin: bi === 0 ? 0 : '10px 0 0', whiteSpace: 'pre-wrap' }}>
            {renderInlineWithBreaks(block)}
          </p>
        );
      })}
    </div>
  );
}

