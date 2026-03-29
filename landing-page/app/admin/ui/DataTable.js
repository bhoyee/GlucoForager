'use client';

import { useMemo, useState } from 'react';

function normalizeText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function compareValues(a, b) {
  const ax = a === null || a === undefined ? '' : a;
  const bx = b === null || b === undefined ? '' : b;

  if (typeof ax === 'number' && typeof bx === 'number') return ax - bx;
  return String(ax).localeCompare(String(bx), undefined, { numeric: true, sensitivity: 'base' });
}

export default function DataTable({
  columns,
  rows,
  getRowId,
  initialPageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
  initialSortKey = null,
  initialSortDir = 'asc',
  searchPlaceholder = 'Search…',
  showFilters = true,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeCols = Array.isArray(columns) ? columns : [];

  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);
  const [filters, setFilters] = useState({});

  const colByKey = useMemo(() => {
    const m = new Map();
    safeCols.forEach((c) => m.set(c.key, c));
    return m;
  }, [safeCols]);

  const searchableCols = useMemo(() => safeCols.filter((c) => c.searchable !== false), [safeCols]);

  const filteredRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const activeFilters = filters && typeof filters === 'object' ? filters : {};

    return safeRows.filter((row) => {
      if (q) {
        const haystack = searchableCols
          .map((c) => {
            const raw = c.accessor ? c.accessor(row) : row?.[c.key];
            return normalizeText(raw);
          })
          .join(' | ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      for (const [k, fv] of Object.entries(activeFilters)) {
        const ftxt = String(fv || '').trim().toLowerCase();
        if (!ftxt) continue;
        const c = colByKey.get(k);
        if (!c) continue;
        const raw = c.accessor ? c.accessor(row) : row?.[c.key];
        const txt = normalizeText(raw).toLowerCase();
        if (!txt.includes(ftxt)) return false;
      }

      return true;
    });
  }, [safeRows, searchableCols, query, filters, colByKey]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const col = colByKey.get(sortKey);
    if (!col || col.sortable === false) return filteredRows;

    const dir = sortDir === 'desc' ? -1 : 1;
    const getVal = (row) => {
      if (col.sortValue) return col.sortValue(row);
      if (col.accessor) return col.accessor(row);
      return row?.[col.key];
    };

    return [...filteredRows].sort((ra, rb) => dir * compareValues(getVal(ra), getVal(rb)));
  }, [filteredRows, sortKey, sortDir, colByKey]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageRows = useMemo(() => {
    const start = safePageIndex * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePageIndex, pageSize]);

  const toggleSort = (k) => {
    const col = colByKey.get(k);
    if (!col || col.sortable === false) return;
    setPageIndex(0);
    setSortKey((prev) => {
      if (prev !== k) {
        setSortDir('asc');
        return k;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return k;
    });
  };

  const setFilter = (k, v) => {
    setPageIndex(0);
    setFilters((prev) => ({ ...(prev || {}), [k]: v }));
  };

  return (
    <div>
      <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => {
              setPageIndex(0);
              setQuery(e.target.value);
            }}
            placeholder={searchPlaceholder}
            style={{ width: 260 }}
          />
          <span className="admin-subtitle" style={{ margin: 0 }}>
            {total} result{total === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="admin-subtitle" style={{ margin: 0 }}>
            Rows
          </span>
          <select
            value={String(pageSize)}
            onChange={(e) => {
              setPageIndex(0);
              setPageSize(Number(e.target.value));
            }}
            className="admin-select"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
          <button className="admin-button secondary" type="button" disabled={safePageIndex <= 0} onClick={() => setPageIndex((p) => Math.max(0, p - 1))}>
            Prev
          </button>
          <span className="admin-subtitle" style={{ margin: 0 }}>
            {safePageIndex + 1}/{totalPages}
          </span>
          <button
            className="admin-button secondary"
            type="button"
            disabled={safePageIndex >= totalPages - 1}
            onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              {safeCols.map((c) => {
                const sortable = c.sortable !== false;
                const active = sortKey === c.key;
                const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                return (
                  <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="admin-button secondary"
                        style={{ padding: '6px 10px', borderRadius: 10 }}
                      >
                        {c.header}
                        {arrow}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
            {showFilters ? (
              <tr>
                {safeCols.map((c) => (
                  <th key={`${c.key}-filter`}>
                    {c.filterable ? (
                      <input
                        value={filters?.[c.key] || ''}
                        onChange={(e) => setFilter(c.key, e.target.value)}
                        placeholder="Filter…"
                        style={{ width: '100%' }}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {pageRows.map((row, idx) => (
              <tr key={getRowId ? getRowId(row) : row?.id ?? idx}>
                {safeCols.map((c) => (
                  <td key={`${(getRowId ? getRowId(row) : row?.id ?? idx)}-${c.key}`} style={c.cellStyle ? c.cellStyle(row) : undefined}>
                    {c.render ? c.render(row) : normalizeText(c.accessor ? c.accessor(row) : row?.[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
