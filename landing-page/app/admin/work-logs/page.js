'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import EmptyState from '../ui/EmptyState';
import LoadingState from '../ui/LoadingState';
import DataTable from '../ui/DataTable';
import TaskContent from '../ui/TaskContent';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
const MAX_UNFINISHED_REASON_CHARS = 500;

function isQuillEmpty(html) {
  const s = String(html || '').trim();
  if (!s) return true;
  if (s === '<p><br></p>') return true;
  if (!s.includes('<')) return !s;
  try {
    const el = document.createElement('div');
    el.innerHTML = s;
    const text = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
    return !text;
  } catch {
    return !s.replace(/<[^>]*>/g, '').trim();
  }
}

function toQuillHtml(value) {
  const raw = String(value || '');
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('<') && s.includes('>')) return raw;
  const escape = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return raw
    .split(/\r?\n/)
    .map((line) => `<p>${escape(line) || '<br>'}</p>`)
    .join('');
}

function stripHtml(value) {
  const raw = String(value || '');
  const s = raw.trim();
  if (!s) return '';
  if (!s.includes('<')) return raw;
  try {
    const el = document.createElement('div');
    el.innerHTML = s;
    return (el.textContent || '').replace(/\u00A0/g, ' ').trim();
  } catch {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isoDateInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // ignore
  }
  return new Date().toISOString().slice(0, 10);
}

function isoDateAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function formatDateTimeInTimeZone(iso, timeZone) {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timeZone || 'UTC',
    });
  } catch {
    return String(iso);
  }
}

const SUMMARY_QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
};

const NOTE_QUILL_MODULES = {
  toolbar: [
    [{ size: ['small', false, 'large'] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

function mondayOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function monthStartISO(d) {
  const x = new Date(d);
  x.setDate(1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`;
}

function WorkLogsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken')), []);
  const getTokenNow = () => (typeof window === 'undefined' ? null : localStorage.getItem('adminToken'));

  const [session, setSession] = useState(null);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  const isManager = permissions.includes('*') || permissions.includes('work_logs.manage');
  const staffTimeZone = useMemo(() => String(session?.timezone || 'UTC'), [session?.timezone]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const staffTodayISO = useMemo(() => isoDateInTimeZone(new Date(nowTick), staffTimeZone), [nowTick, staffTimeZone]);

  const [message, setMessage] = useState('');
  const messageAnchorRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [monthLogs, setMonthLogs] = useState([]);
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const [monthViewLoading, setMonthViewLoading] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(null);
  const [monthViewPlan, setMonthViewPlan] = useState(null); // { tasks, milestones }

  const [planLoading, setPlanLoading] = useState(false);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [milestones, setMilestones] = useState({ weekly: [], monthly: [] });
  const [taskDrafts, setTaskDrafts] = useState({});
  const [myTaskText, setMyTaskText] = useState('');

  const [summary, setSummary] = useState('');
  const [workLogAttachments, setWorkLogAttachments] = useState([]);
  const attachmentsInputRef = useRef(null);
  const [workDate, setWorkDate] = useState(todayISO());
  const [workDateReason, setWorkDateReason] = useState('');
  const [workDateLoading, setWorkDateLoading] = useState(false);
  const workDateRef = useRef(workDate);
  const workDateTouchedRef = useRef(false);
  const lastStaffTodayRef = useRef(staffTodayISO);
  const [workDateLog, setWorkDateLog] = useState(null);
  const [submittedModalOpen, setSubmittedModalOpen] = useState(false);
  const [unfinishedModalOpen, setUnfinishedModalOpen] = useState(false);
  const [unfinishedTaskId, setUnfinishedTaskId] = useState(null);
  const [unfinishedReason, setUnfinishedReason] = useState('');
  const [unfinishedError, setUnfinishedError] = useState('');

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [currentMonthName, setCurrentMonthName] = useState('');
  const monthNames = useMemo(
    () => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    []
  );
  const selectedMonthName = monthNames[Math.min(Math.max(month, 1), 12) - 1] || '';

  const [staffUsers, setStaffUsers] = useState([]);
  const [staffUserId, setStaffUserId] = useState('');
  const [assignStaffUserId, setAssignStaffUserId] = useState('');
  const [weekStart, setWeekStart] = useState(mondayOfWeek(now));
  const [weekData, setWeekData] = useState(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [bulkRemindLoading, setBulkRemindLoading] = useState(false);
  const [allWeekStart, setAllWeekStart] = useState(mondayOfWeek(now));
  const [missingAllLoading, setMissingAllLoading] = useState(false);
  const [missingAllItems, setMissingAllItems] = useState([]);
  const [missingAllUnremindedOnly, setMissingAllUnremindedOnly] = useState(true);
  const [bulkAllLoading, setBulkAllLoading] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');

  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleItems, setRoleItems] = useState([]);

  const [assignDate, setAssignDate] = useState(todayISO());
  const [assignText, setAssignText] = useState('');
  const [assignRoleKey, setAssignRoleKey] = useState('');
  const [managerMessage, setManagerMessage] = useState('');
  const [managerMessageTone, setManagerMessageTone] = useState('info'); // info | success | warning | danger
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignRoleLoading, setAssignRoleLoading] = useState(false);

  const [milestoneRoleKey, setMilestoneRoleKey] = useState('');
  const [milestoneCadence, setMilestoneCadence] = useState('weekly');
  const [milestonePeriodStart, setMilestonePeriodStart] = useState(mondayOfWeek(now));
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [milestoneLoading, setMilestoneLoading] = useState(false);
  const [milestoneItems, setMilestoneItems] = useState([]);

  const [selectedLogId, setSelectedLogId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [managerToolsOpen, setManagerToolsOpen] = useState(false);

  const taskTextLabel = (task) => {
    const direct = task?.text;
    if (typeof direct === 'string') return direct;
    if (direct && typeof direct === 'object') {
      if (typeof direct.text === 'string') return direct.text;
      if (typeof direct.value === 'string') return direct.value;
      if (typeof direct.label === 'string') return direct.label;
      return '[Invalid task text]';
    }
    if (typeof task?.title === 'string') return task.title;
    const fallback = direct == null ? '' : String(direct);
    return fallback === '[object Object]' ? '[Invalid task text]' : fallback;
  };

  const fileKey = (f) => {
    if (!f) return '';
    return `${String(f.name || '')}::${String(f.size || '')}::${String(f.lastModified || '')}`;
  };

  const mergeFiles = (prevFiles, nextFiles, max = 5) => {
    const prev = Array.isArray(prevFiles) ? prevFiles.filter(Boolean) : [];
    const incoming = Array.isArray(nextFiles) ? nextFiles.filter(Boolean) : [];
    const seen = new Set(prev.map(fileKey).filter(Boolean));
    const out = [...prev];
    for (const f of incoming) {
      if (out.length >= max) break;
      const k = fileKey(f);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(f);
    }
    return out.slice(0, max);
  };

  const confirmActionRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('Confirm');
  const [confirmBody, setConfirmBody] = useState('');
  const [confirmCtaLabel, setConfirmCtaLabel] = useState('Yes, continue');
  const [confirmCtaClassName, setConfirmCtaClassName] = useState('admin-button danger');
  const openConfirm = ({ title, body, onConfirm, confirmLabel, confirmClassName }) => {
    confirmActionRef.current = typeof onConfirm === 'function' ? onConfirm : null;
    setConfirmTitle(title || 'Confirm');
    setConfirmBody(body || '');
    setConfirmCtaLabel(confirmLabel || 'Yes, continue');
    setConfirmCtaClassName(confirmClassName || 'admin-button danger');
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmTitle('Confirm');
    setConfirmBody('');
    setConfirmCtaLabel('Yes, continue');
    setConfirmCtaClassName('admin-button danger');
    confirmActionRef.current = null;
  };
  const runConfirm = async () => {
    const fn = confirmActionRef.current;
    closeConfirm();
    if (fn) await fn();
  };

  const [manageTaskItems, setManageTaskItems] = useState([]);
  const [manageTaskLoading, setManageTaskLoading] = useState(false);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState(null);
  const [taskEditDate, setTaskEditDate] = useState(todayISO());
  const [taskEditText, setTaskEditText] = useState('');
  const [taskEditSaving, setTaskEditSaving] = useState(false);

  const loadManageTasks = async () => {
    if (!token || !isManager) return;
    if (!assignDate) return;
    const sid = String(assignStaffUserId || '').trim();
    setManageTaskLoading(true);
    try {
      const url = `${API_URL}/api/admin/work-plans/tasks?start=${encodeURIComponent(assignDate)}&end=${encodeURIComponent(assignDate)}${
        sid ? `&staff_user_id=${encodeURIComponent(sid)}` : ''
      }`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load tasks.');
      setManageTaskItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setManageTaskItems([]);
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to load tasks.');
    } finally {
      setManageTaskLoading(false);
    }
  };

  const openTaskEdit = (t) => {
    if (!t?.id) return;
    setTaskEditId(t.id);
    setTaskEditDate(String(t.work_date || assignDate || todayISO()).slice(0, 10));
    setTaskEditText(typeof t.text === 'string' ? t.text : String(t.text || '').trim());
    setTaskEditOpen(true);
  };

  const closeTaskEdit = () => {
    setTaskEditOpen(false);
    setTaskEditId(null);
    setTaskEditDate(todayISO());
    setTaskEditText('');
    setTaskEditSaving(false);
  };

  const saveTaskEdit = async () => {
    if (!token || !isManager) return;
    if (!taskEditId) return;
    const text = typeof taskEditText === 'string' ? taskEditText.trim() : '';
    if (!text) return;
    setTaskEditSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/${taskEditId}/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_date: taskEditDate, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update task.');
      setManagerMessageTone('success');
      setManagerMessage('Task updated.');
      closeTaskEdit();
      loadManageTasks();
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to update task.');
    } finally {
      setTaskEditSaving(false);
    }
  };

  const deleteManageTask = async (taskId) => {
    if (!token || !isManager || !taskId) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/${taskId}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete task.');
      setManagerMessageTone('success');
      setManagerMessage('Task deleted.');
      loadManageTasks();
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to delete task.');
    }
  };

  const [milestoneEditOpen, setMilestoneEditOpen] = useState(false);
  const [milestoneEditId, setMilestoneEditId] = useState(null);
  const [milestoneEditTitle, setMilestoneEditTitle] = useState('');
  const [milestoneEditDescription, setMilestoneEditDescription] = useState('');
  const [milestoneEditSaving, setMilestoneEditSaving] = useState(false);

  const openMilestoneEdit = (m) => {
    if (!m?.id) return;
    setMilestoneEditId(m.id);
    setMilestoneEditTitle(typeof m.title === 'string' ? m.title : String(m.title || '').trim());
    setMilestoneEditDescription(typeof m.description === 'string' ? m.description : '');
    setMilestoneEditOpen(true);
  };

  const closeMilestoneEdit = () => {
    setMilestoneEditOpen(false);
    setMilestoneEditId(null);
    setMilestoneEditTitle('');
    setMilestoneEditDescription('');
    setMilestoneEditSaving(false);
  };

  const saveMilestoneEdit = async () => {
    if (!token || !isManager || !milestoneEditId) return;
    const title = String(milestoneEditTitle || '').trim();
    if (!title) return;
    setMilestoneEditSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneEditId}/update`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: String(milestoneEditDescription || '').trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update milestone.');
      setManagerMessageTone('success');
      setManagerMessage('Milestone updated.');
      closeMilestoneEdit();
      loadMilestones();
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to update milestone.');
    } finally {
      setMilestoneEditSaving(false);
    }
  };

  const deleteMilestoneRow = async (milestoneId) => {
    if (!token || !isManager || !milestoneId) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneId}/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete milestone.');
      setManagerMessageTone('success');
      setManagerMessage('Milestone deleted.');
      loadMilestones();
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to delete milestone.');
    }
  };

  const loadSession = async () => {
    const t = getTokenNow();
    if (!t) {
      router.push('/admin');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSession(data);
    } catch {
      setSession(null);
    }
  };

  const loadMonth = async () => {
    const t = getTokenNow();
    if (!t) {
      router.push('/admin');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/month?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load work logs.');
      setMonthLogs(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMessage(e?.message || 'Failed to load work logs.');
    } finally {
      setLoading(false);
    }
  };

  const loadStaff = async () => {
    if (!token || !isManager) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff users.');
      const items = Array.isArray(data.items) ? data.items : [];
      setStaffUsers(items);
      if (!staffUserId && items[0]?.id) setStaffUserId(String(items[0].id));
    } catch (e) {
      setMessage(e?.message || 'Failed to load staff users.');
    }
  };

  const loadWeek = async () => {
    if (!token || !isManager || !staffUserId || !weekStart) return;
    setWeekLoading(true);
    setMessage('');
    try {
      const res = await fetch(
        `${API_URL}/api/admin/work-logs/week?start=${encodeURIComponent(weekStart)}&staff_user_id=${encodeURIComponent(staffUserId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load weekly work logs.');
      setWeekData(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load weekly work logs.');
      setWeekData(null);
    } finally {
      setWeekLoading(false);
    }
  };

  const loadMissingAll = async () => {
    if (!token || !isManager || !allWeekStart) return;
    setMissingAllLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/missing?start=${encodeURIComponent(allWeekStart)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load missing logs.');
      setMissingAllItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMissingAllItems([]);
      setMessage(e?.message || 'Failed to load missing logs.');
    } finally {
      setMissingAllLoading(false);
    }
  };

  const bulkRemindAllMissing = async () => {
    if (!token || !isManager || !allWeekStart) return;
    setBulkAllLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/reminders/bulk-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: allWeekStart, message: 'Reminder: please submit your work log' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to send reminders.');
      setMessage(`Reminders created: ${data.created || 0}`);
      loadMissingAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to send reminders.');
    } finally {
      setBulkAllLoading(false);
    }
  };

  const sendReminderFor = async (staffId, workDate) => {
    if (!token || !isManager) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(staffId),
          work_date: workDate,
          message: 'Reminder: please submit your work log',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save reminder.');
      loadMissingAll();
    } catch (e) {
      setMessage(e?.message || 'Failed to save reminder.');
    }
  };

  const bulkRemindMissing = async () => {
    if (!token || !isManager || !staffUserId || !weekStart) return;
    setBulkRemindLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/reminders/bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(staffUserId),
          week_start: weekStart,
          message: 'Reminder: please submit your work log',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to send reminders.');
      setMessage(`Reminders created: ${data.created || 0}`);
      loadWeek();
    } catch (e) {
      setMessage(e?.message || 'Failed to send reminders.');
    } finally {
      setBulkRemindLoading(false);
    }
  };

  const loadLogDetail = async (logId) => {
    if (!token || !logId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/${logId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load work log.');
      setSelectedLogId(logId);
      setSelectedLog(data);
    } catch (e) {
      setMessage(e?.message || 'Failed to load work log.');
      setSelectedLogId(null);
      setSelectedLog(null);
    }
  };

  const loadPlanForDate = async (workDate) => {
    const t = getTokenNow();
    if (!t || !workDate) return null;
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/my?work_date=${encodeURIComponent(workDate)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return null;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load tasks.');
      return {
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        milestones: data.milestones && typeof data.milestones === 'object' ? data.milestones : { weekly: [], monthly: [] },
      };
    } catch {
      return { tasks: [], milestones: { weekly: [], monthly: [] } };
    }
  };

  const openMonthLogView = async (row) => {
    if (!row?.work_date) return;
    setMessage('');
    setMonthViewOpen(true);
    setMonthViewLoading(true);
    setMonthViewDate(row.work_date);
    setMonthViewPlan(null);
    try {
      if (row.id) await loadLogDetail(row.id);
      const plan = await loadPlanForDate(row.work_date);
      setMonthViewPlan(plan);
    } finally {
      setMonthViewLoading(false);
    }
  };

  const closeMonthLogView = () => {
    setMonthViewOpen(false);
    setMonthViewLoading(false);
    setMonthViewDate(null);
    setMonthViewPlan(null);
    setSelectedLogId(null);
    setSelectedLog(null);
    setCommentDraft('');
  };

  const loadPlan = async () => {
    const t = getTokenNow();
    if (!t) return;
    setPlanLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/my?work_date=${encodeURIComponent(workDate)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load assigned tasks.');
      setAssignedTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setMilestones(data.milestones && typeof data.milestones === 'object' ? data.milestones : { weekly: [], monthly: [] });
    } catch (e) {
      setAssignedTasks([]);
      setMilestones({ weekly: [], monthly: [] });
      setMessage(e?.message || 'Failed to load assigned tasks.');
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const refresh = (event) => {
      try {
        const href = event?.detail?.href;
        if (href && String(href) !== '/admin/work-logs') return;
      } catch {
        // ignore
      }
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      loadPlan();
    };

    window.addEventListener('admin-work-logs-updated', refresh);
    window.addEventListener('admin-route-refresh', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    // Poll so new tasks appear even if you're already on this page.
    const timer = setInterval(() => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      loadPlan();
    }, 20_000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('admin-work-logs-updated', refresh);
      window.removeEventListener('admin-route-refresh', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [workDate]); // refresh when date changes

  const loadWorkDateLog = async (d) => {
    const t = getTokenNow();
    if (!t || !d) return;
    setWorkDateLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/by-date?work_date=${encodeURIComponent(d)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load work log.');
      const item = data?.item && typeof data.item === 'object' ? data.item : null;
      setWorkDateLog(item);
      setWorkLogAttachments([]);
      const nextSummary = item?.payload?.summary ? String(item.payload.summary) : '';
      setSummary(toQuillHtml(nextSummary));
      if (!item) {
        setWorkDateReason('');
      } else {
        const nextReason = item?.payload?.reason ? String(item.payload.reason) : '';
        if (nextReason) setWorkDateReason(nextReason);
      }
    } catch {
      setSummary('');
      setWorkDateLog(null);
    } finally {
      setWorkDateLoading(false);
    }
  };

  const setTaskDraft = (taskId, next) => {
    setTaskDrafts((prev) => ({ ...(prev || {}), [String(taskId)]: next }));
  };


  const openUnfinishedModal = (task) => {
    const id = task?.id ? Number(task.id) : null;
    if (!id) return;
    setUnfinishedTaskId(id);
    setUnfinishedReason(String(task?.unfinished_reason || '').slice(0, MAX_UNFINISHED_REASON_CHARS));
    setUnfinishedError('');
    setUnfinishedModalOpen(true);
  };

  const closeUnfinishedModal = () => {
    setUnfinishedModalOpen(false);
    setUnfinishedTaskId(null);
    setUnfinishedReason('');
    setUnfinishedError('');
  };

  const completeAssignedTask = async (taskId, isCompleted, extraPayload) => {
    const t = getTokenNow();
    if (!t) return;
    setMessage('');
    const draft = taskDrafts?.[String(taskId)] || {};
    const proof_links = Array.isArray(draft.proof_links) ? draft.proof_links : [];
    const completion_note = isQuillEmpty(draft.completion_note) ? '' : String(draft.completion_note || '');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_completed: Boolean(isCompleted),
          proof_links,
          completion_note,
          ...(extraPayload && typeof extraPayload === 'object' ? extraPayload : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to update task.');
      loadPlan();
      try {
        window.dispatchEvent(new Event('admin-work-logs-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      setMessage(e?.message || 'Failed to update task.');
      try {
        messageAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      } catch {
        // ignore
      }
    }
  };

  const saveUnfinishedReason = async () => {
    if (!unfinishedTaskId) return;
    const reason = String(unfinishedReason || '').trim();
    if (reason.length < 3) {
      setUnfinishedError('Reason is required (min 3 characters).');
      return;
    }
    if (reason.length > MAX_UNFINISHED_REASON_CHARS) {
      setUnfinishedError(`Max ${MAX_UNFINISHED_REASON_CHARS} characters.`);
      return;
    }
    closeUnfinishedModal();
    await completeAssignedTask(unfinishedTaskId, false, { unfinished_reason: reason });
  };

  const addMyTask = async () => {
    const t = getTokenNow();
    if (!t) return;
    const text = typeof myTaskText === 'string' ? myTaskText.trim() : '';
    if (!text) return;
    setMessage('');
    try {
      const d = workDateRef.current || staffTodayISO;
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/self-add`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_date: d, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to add task.');
      setMyTaskText('');
      try {
        const plan = await loadPlanForDate(d);
        if (plan) {
          setAssignedTasks(Array.isArray(plan.tasks) ? plan.tasks : []);
          setMilestones(plan.milestones && typeof plan.milestones === 'object' ? plan.milestones : { weekly: [], monthly: [] });
        } else {
          loadPlan();
        }
      } catch {
        loadPlan();
      }
      try {
        window.dispatchEvent(new Event('admin-work-logs-updated'));
      } catch {
        // ignore
      }
    } catch (e) {
      setMessage(e?.message || 'Failed to add task.');
    }
  };

  const loadRoles = async () => {
    if (!token || !isManager) return;
    setRolesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/staff/roles`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load roles.');
      const items = Array.isArray(data.items) ? data.items : [];
      setRoleItems(items);
      if (!milestoneRoleKey && items[0]?.key) setMilestoneRoleKey(String(items[0].key));
    } catch {
      const fallback = [
        { key: 'admin', name: 'Admin' },
        { key: 'designer', name: 'Designer' },
        { key: 'developer', name: 'Developer' },
        { key: 'hr', name: 'HR' },
        { key: 'marketer', name: 'Marketer' },
        { key: 'support', name: 'Support' },
      ];
      setRoleItems(fallback);
      if (!milestoneRoleKey) setMilestoneRoleKey('designer');
    } finally {
      setRolesLoading(false);
    }
  };

  const assignTask = async () => {
    if (!token || !isManager) return;
    const staffId = Number(assignStaffUserId);
    const text = typeof assignText === 'string' ? assignText.trim() : '';
    if (!staffId || !text) return;
    setManagerMessage('');
    setManagerMessageTone('info');
    setAssignLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/assign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_user_id: staffId, work_date: assignDate, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to assign task.');
      setAssignText('');
      setManagerMessageTone('success');
      setManagerMessage('Task assigned.');
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to assign task.');
    } finally {
      setAssignLoading(false);
    }
  };

  const assignTaskToRole = async () => {
    if (!token || !isManager) return;
    const role_key = String(assignRoleKey || '').trim();
    const text = typeof assignText === 'string' ? assignText.trim() : '';
    if (!role_key || !text) return;
    setManagerMessage('');
    setManagerMessageTone('info');
    setAssignRoleLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/tasks/assign-role`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_key, work_date: assignDate, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        router.push('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.detail || 'Failed to assign task.');
      setAssignText('');
      setManagerMessageTone('success');
      setManagerMessage(`Assigned to ${data.count || 0} staff.`);
    } catch (e) {
      setManagerMessageTone('danger');
      setManagerMessage(e?.message || 'Failed to assign task.');
    } finally {
      setAssignRoleLoading(false);
    }
  };

  const loadMilestones = async () => {
    if (!token || !isManager || !milestoneRoleKey || !milestonePeriodStart || !milestoneCadence) return;
    setMilestoneLoading(true);
    try {
      const url = `${API_URL}/api/admin/work-plans/milestones?role_key=${encodeURIComponent(milestoneRoleKey)}&cadence=${encodeURIComponent(
        milestoneCadence
      )}&period_start=${encodeURIComponent(milestonePeriodStart)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to load milestones.');
      setMilestoneItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setMilestoneItems([]);
      setMessage(e?.message || 'Failed to load milestones.');
    } finally {
      setMilestoneLoading(false);
    }
  };

  const createMilestone = async () => {
    if (!token || !isManager) return;
    const title = String(milestoneTitle || '').trim();
    if (!title || !milestoneRoleKey || !milestonePeriodStart) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_key: milestoneRoleKey,
          cadence: milestoneCadence,
          period_start: milestonePeriodStart,
          title,
          description: String(milestoneDescription || '').trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to create milestone.');
      setMilestoneTitle('');
      setMilestoneDescription('');
      setMessage('Milestone created.');
      loadMilestones();
    } catch (e) {
      setMessage(e?.message || 'Failed to create milestone.');
    }
  };

  const setMilestoneDone = async (milestoneId, isCompleted) => {
    if (!token || !isManager) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-plans/milestones/${milestoneId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: Boolean(isCompleted) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to update milestone.');
      loadMilestones();
    } catch (e) {
      setMessage(e?.message || 'Failed to update milestone.');
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  useEffect(() => {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    try {
      setCurrentMonthName(names[new Date().getMonth()] || '');
    } catch {
      setCurrentMonthName('');
    }
  }, []);

  useEffect(() => {
    loadMonth();
  }, [token, year, month]);

  useEffect(() => {
    loadPlan();
  }, [token, workDate]);

  useEffect(() => {
    const qp = searchParams?.get('date') || searchParams?.get('work_date');
    if (!qp || !isISODate(qp)) return;
    const today = staffTodayISO;
    const minDate = isoDateAddDays(today, -6);
    const next = qp < minDate ? minDate : qp > today ? today : qp;
    workDateTouchedRef.current = true;
    setWorkDate(next);
  }, [searchParams, staffTodayISO]);

  useEffect(() => {
    if (workDateTouchedRef.current) return;
    if (!isISODate(staffTodayISO)) return;
    if (workDate !== staffTodayISO) {
      workDateRef.current = staffTodayISO;
      setWorkDate(staffTodayISO);
    }
  }, [staffTodayISO, workDate]);

  useEffect(() => {
    const prev = lastStaffTodayRef.current;
    if (!prev || prev === staffTodayISO) return;

    const hasQuery = Boolean(searchParams?.get('date') || searchParams?.get('work_date'));
    // New day: always reset to "today" unless the URL explicitly asked for a specific date.
    if (!hasQuery) {
      workDateTouchedRef.current = false;
      workDateRef.current = staffTodayISO;
      setWorkDate(staffTodayISO);
    }

    lastStaffTodayRef.current = staffTodayISO;
  }, [searchParams, staffTodayISO]);

  useEffect(() => {
    if (!token) return;
    const today = staffTodayISO;
    const minDate = isoDateAddDays(today, -6);
    if (!isISODate(workDate)) return;
    if (workDate < minDate) {
      setWorkDate(minDate);
      return;
    }
    if (workDate > today) {
      setWorkDate(today);
      return;
    }
    loadWorkDateLog(workDate);
    if (workDate === today) setWorkDateReason('');
  }, [token, workDate, staffTodayISO]);

  useEffect(() => {
    workDateRef.current = workDate;
  }, [workDate]);

  useEffect(() => {
    // Keep "today" fresh across midnight without requiring a full page refresh.
    const tick = () => setNowTick(Date.now());
    const timer = setInterval(tick, 60_000);
    const onFocus = () => tick();
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    loadStaff();
  }, [token, isManager]);

  useEffect(() => {
    loadWeek();
  }, [token, isManager, staffUserId, weekStart]);

  useEffect(() => {
    loadMissingAll();
  }, [token, isManager, allWeekStart]);

  useEffect(() => {
    loadRoles();
  }, [token, isManager]);

  useEffect(() => {
    if (!milestoneRoleKey) return;
    loadMilestones();
  }, [token, isManager, milestoneRoleKey, milestoneCadence, milestonePeriodStart]);

  useEffect(() => {
    const logId = searchParams?.get('log');
    if (!logId) return;
    const n = Number(logId);
    if (Number.isNaN(n) || n <= 0) return;
    loadLogDetail(n);
  }, [searchParams, token]);

  const saveToday = async () => {
    const t = getTokenNow();
    if (!t) return;
    setMessage('');
    const today = staffTodayISO;
    const minDate = isoDateAddDays(today, -6);
    const d = workDateRef.current || workDate;
    if (!isISODate(d)) {
      setMessage('Pick a valid date.');
      return;
    }
    if (d < minDate || d > today) {
      setMessage(`You can only submit logs from ${minDate} to ${today}.`);
      return;
    }
    if (d !== today && !String(workDateReason || '').trim()) {
      setMessage('Reason is required when submitting a previous day.');
      return;
    }

    const submit = async () => {
      try {
        const fd = new FormData();
        fd.set('work_date', d);
        fd.set('summary', isQuillEmpty(summary) ? '' : summary);
        fd.set('reason', d !== today ? String(workDateReason || '').trim() : '');
        (Array.isArray(workLogAttachments) ? workLogAttachments : []).slice(0, 5).forEach((f) => {
          if (f) fd.append('attachments', f);
        });

        const res = await fetch(`${API_URL}/api/admin/work-logs/upsert/form`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}` },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          router.push('/admin');
          return;
        }
        if (!res.ok) throw new Error(data.detail || 'Failed to save work log.');
        setMessage('Submitted.');
        setWorkLogAttachments([]);
        loadMonth();
        loadWorkDateLog(workDate);
      } catch (e) {
        setMessage(e?.message || 'Failed to save work log.');
      }
    };

    openConfirm({
      title: 'Submit work log',
      body: `Submit work log for ${d}? This will lock the day as read-only.`,
      onConfirm: submit,
      confirmLabel: 'Submit',
      confirmClassName: 'admin-button',
    });
  };

  const sendReminder = async (workDate) => {
    if (!token || !staffUserId) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_user_id: Number(staffUserId),
          work_date: workDate,
          message: 'Reminder: please submit your work log',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save reminder.');
      loadWeek();
    } catch (e) {
      setMessage(e?.message || 'Failed to save reminder.');
    }
  };

  const addFeedback = async () => {
    if (!token || !isManager || !selectedLogId) return;
    const text = String(commentDraft || '').trim();
    if (!text) return;
    setMessage('');
    try {
      const res = await fetch(`${API_URL}/api/admin/work-logs/${selectedLogId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to add comment.');
      setCommentDraft('');
      loadLogDetail(selectedLogId);
      loadWeek();
    } catch (e) {
      setMessage(e?.message || 'Failed to add comment.');
    }
  };

  const isWorkDateLocked = Boolean(workDateLog?.id);
  const submittedAtLabel = useMemo(() => {
    if (!workDateLog?.id) return '';
    const iso = workDateLog.updated_at || workDateLog.created_at || '';
    return formatDateTimeInTimeZone(iso, staffTimeZone);
  }, [staffTimeZone, workDateLog?.created_at, workDateLog?.id, workDateLog?.updated_at]);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2 className="admin-title">Daily Work Log</h2>
        <div ref={messageAnchorRef} />
        {message && <p className="admin-subtitle">{message}</p>}

        <div className="admin-card" style={{ padding: 14, marginTop: 12 }}>
          <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Tasks & targets</h3>
              <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                Assigned tasks + role milestones for {workDate}.
              </p>
            </div>
            <button className="admin-button info" type="button" onClick={loadPlan} disabled={planLoading}>
              {planLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="admin-field" style={{ marginBottom: 0, minWidth: 220 }}>
              <label>Work date</label>
              <input
                type="date"
                value={workDate}
                min={isoDateAddDays(staffTodayISO, -6)}
                max={staffTodayISO}
                onChange={(e) => {
                  const v = e.target.value;
                  workDateTouchedRef.current = true;
                  workDateRef.current = v;
                  setWorkDate(v);
                }}
              />
            </div>
            {workDateLoading ? <p className="admin-subtitle" style={{ margin: 0 }}>Loading log…</p> : null}
          </div>

          {isWorkDateLocked ? (
            <div className="admin-alert info" style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  Work log already submitted for {workDate}. This day is now read-only.
                  {submittedAtLabel ? <span className="admin-subtitle"> {' '}Submitted at {submittedAtLabel}.</span> : null}
                </div>
                <button className="admin-button secondary" type="button" onClick={() => setSubmittedModalOpen(true)}>
                  View submitted
                </button>
              </div>
            </div>
          ) : null}

          {workDate !== staffTodayISO ? (
            <div className="admin-field" style={{ marginTop: 10 }}>
              <label style={{ color: '#e53935', fontWeight: 800 }}>Reason (required for previous day)</label>
              <textarea
                value={workDateReason}
                onChange={(e) => setWorkDateReason(e.target.value)}
                rows={2}
                placeholder="Why are you submitting this work log late?"
                readOnly={isWorkDateLocked}
              />
            </div>
          ) : null}

          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 800, color: '#0f2f3f' }}>Assigned tasks</h4>
            {assignedTasks.length === 0 ? (
              <p className="admin-subtitle" style={{ margin: 0 }}>
                No tasks assigned for this date.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {assignedTasks.map((t, taskIndex) => {
                  const draft = taskDrafts?.[String(t.id)] || { proof_links: [''], completion_note: '' };
                  const proofLinks = Array.isArray(draft.proof_links) ? draft.proof_links : [''];
                  return (
                    <div key={t.id} className="admin-card" style={{ padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 900, color: '#1976d2', marginTop: 1 }}>{taskIndex + 1}.</div>
                            <TaskContent text={taskTextLabel(t)} style={{ margin: 0, fontWeight: 500, color: '#1976d2' }} />
                          </div>
                          {t.is_completed ? (
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                              Done {t.completed_at ? `• ${String(t.completed_at).slice(0, 19).replace('T', ' ')}` : ''}
                            </p>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {t.is_completed ? (
                            <button className="admin-button warning" type="button" onClick={() => completeAssignedTask(t.id, false)} disabled={isWorkDateLocked}>
                              Undo
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {!t.is_completed ? (
                        <div style={{ marginTop: 10 }}>
                          {String(t.unfinished_reason || '').trim() ? (
                            <div className="admin-card admin-card--subtle" style={{ padding: 10, marginBottom: 10 }}>
                              <p className="admin-subtitle" style={{ margin: 0 }}>
                                Marked unfinished
                              </p>
                              <p style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>{String(t.unfinished_reason || '').trim()}</p>
                            </div>
                          ) : null}
                          <div className="admin-field">
                            <label style={{ color: '#f57c00', fontWeight: 800 }}>Proof links (optional)</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {proofLinks.map((l, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <input
                                    style={{ flex: 1, minWidth: 0 }}
                                    value={l}
                                    disabled={isWorkDateLocked}
                                    onChange={(e) =>
                                      setTaskDraft(t.id, {
                                        ...draft,
                                        proof_links: proofLinks.map((x, i) => (i === idx ? e.target.value : x)),
                                      })
                                    }
                                    placeholder="https://..."
                                  />
                                  <button
                                    className="admin-button danger"
                                    type="button"
                                    disabled={isWorkDateLocked}
                                    onClick={() =>
                                      setTaskDraft(t.id, { ...draft, proof_links: proofLinks.filter((_, i) => i !== idx).length ? proofLinks.filter((_, i) => i !== idx) : [''] })
                                    }
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                              <button
                                className="admin-button info"
                                type="button"
                                disabled={isWorkDateLocked}
                                onClick={() => setTaskDraft(t.id, { ...draft, proof_links: [...proofLinks, ''] })}
                                style={{ alignSelf: 'flex-start' }}
                              >
                                Add link
                              </button>
                            </div>
                          </div>

                        <div className="admin-field">
                          <label>Note (optional)</label>
                          <div
                            className="admin-quill"
                            style={{
                              border: '1px solid #e5e7eb',
                              borderRadius: 12,
                              overflow: 'hidden',
                              background: '#fff',
                              '--editor-height': '120px',
                            }}
                          >
                            <ReactQuill
                              theme="snow"
                              value={draft.completion_note || ''}
                              onChange={(v) => setTaskDraft(t.id, { ...draft, completion_note: v })}
                              readOnly={isWorkDateLocked}
                              modules={NOTE_QUILL_MODULES}
                              placeholder="Add a note (optional)..."
                            />
                          </div>
                          </div>

                          <div className="admin-actions">
                            <button className="admin-button warning" type="button" onClick={() => openUnfinishedModal(t)} disabled={isWorkDateLocked}>
                              {String(t.unfinished_reason || '').trim() ? 'Update unfinished reason' : 'Mark unfinished'}
                            </button>
                            <button className="admin-button" type="button" onClick={() => completeAssignedTask(t.id, true)} disabled={isWorkDateLocked}>
                              Mark done
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          <p className="admin-subtitle" style={{ margin: 0 }}>
                            Proof links: {Array.isArray(t.proof_links) && t.proof_links.length ? t.proof_links.length : 0}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

              <div style={{ marginTop: 12 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 800, color: '#0f2f3f' }}>Add my own task</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    style={{
                      flex: 1,
                      minWidth: 260,
                      background: '#ffffff',
                      border: '1px solid #1976d2',
                      borderRadius: 12,
                      padding: '12px 14px',
                      outline: 'none',
                      boxShadow: '0 1px 0 rgba(16, 24, 40, 0.04)',
                    }}
                    value={myTaskText}
                    onChange={(e) => setMyTaskText(e.target.value)}
                    disabled={isWorkDateLocked}
                    placeholder="Add a task for this date..."
                  />
                  <button
                    className="admin-button info"
                    type="button"
                    onClick={addMyTask}
                    disabled={isWorkDateLocked || !(typeof myTaskText === 'string' && myTaskText.trim())}
                  >
                    Add
                  </button>
                </div>

              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="admin-card" style={{ padding: 12 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 800, color: '#0f2f3f' }}>This week milestones</h4>
              {(Array.isArray(milestones?.weekly) ? milestones.weekly : []).length === 0 ? (
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  No weekly milestones set for your role(s).
                </p>
              ) : (
                <div
                  className="admin-card admin-card--subtle"
                  style={{
                    padding: 12,
                    background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.06), rgba(25, 118, 210, 0.02))',
                    border: '1px solid rgba(25, 118, 210, 0.18)',
                  }}
                >
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'disc' }}>
                    {(Array.isArray(milestones?.weekly) ? milestones.weekly : []).map((m) => (
                      <li
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          fontWeight: 500,
                          fontSize: 13,
                          lineHeight: 1.45,
                          color: '#1f2d3d',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>{m.title}</span>
                        {m.is_completed ? <span className="admin-badge success">Done</span> : <span className="admin-badge secondary">Open</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="admin-card" style={{ padding: 12 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 800, color: '#0f2f3f' }}>{currentMonthName || 'Monthly'} milestones</h4>
              {(Array.isArray(milestones?.monthly) ? milestones.monthly : []).length === 0 ? (
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  No monthly milestones set for your role(s).
                </p>
              ) : (
                <div
                  className="admin-card admin-card--subtle"
                  style={{
                    padding: 12,
                    background: 'linear-gradient(180deg, rgba(245, 124, 0, 0.08), rgba(245, 124, 0, 0.02))',
                    border: '1px solid rgba(245, 124, 0, 0.20)',
                  }}
                >
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'disc' }}>
                    {(Array.isArray(milestones?.monthly) ? milestones.monthly : []).map((m) => (
                      <li
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          fontWeight: 500,
                          fontSize: 13,
                          lineHeight: 1.45,
                          color: '#1f2d3d',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>{m.title}</span>
                        {m.is_completed ? <span className="admin-badge success">Done</span> : <span className="admin-badge secondary">Open</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        <div className="admin-field">
          <label>Summary</label>
          {isWorkDateLocked ? (
            <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
              <TaskContent text={workDateLog?.payload?.summary || '—'} style={{ margin: 0 }} />
            </div>
          ) : (
            <div
              className="admin-quill"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                '--editor-height': '180px',
              }}
            >
              <ReactQuill
                theme="snow"
                value={summary}
                onChange={setSummary}
                readOnly={false}
                modules={SUMMARY_QUILL_MODULES}
                placeholder="What did you work on?"
              />
            </div>
          )}
        </div>

        <div className="admin-field">
          <label>Attachments (optional)</label>
          {isWorkDateLocked ? (
            <div className="admin-card admin-card--subtle" style={{ padding: 12 }}>
              {(Array.isArray(workDateLog?.payload?.attachments) ? workDateLog.payload.attachments : []).length === 0 ? (
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  No attachments.
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(Array.isArray(workDateLog?.payload?.attachments) ? workDateLog.payload.attachments : []).map((a, idx) => (
                    <li key={`${a?.filename || a?.url || idx}`}>
                      <a href={String(a?.url || '#')} target="_blank" rel="noreferrer">
                        {String(a?.original_name || a?.filename || `Attachment ${idx + 1}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div>
              <input
                ref={attachmentsInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  if (picked.length) setWorkLogAttachments((prev) => mergeFiles(prev, picked, 5));
                  // Reset so picking the same file again still triggers onChange.
                  try {
                    e.target.value = '';
                  } catch {
                    // ignore
                  }
                }}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.xls,.xlsx,.doc,.docx,.zip"
              />

              <div className="admin-actions" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="admin-button secondary"
                  type="button"
                  onClick={() => {
                    try {
                      attachmentsInputRef.current?.click?.();
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Add files
                </button>
                <div className="admin-subtitle" style={{ margin: 0 }}>
                  Add up to 5 attachments (you can pick files multiple times).
                </div>
              </div>
              {(Array.isArray(workLogAttachments) ? workLogAttachments : []).length > 0 ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="admin-subtitle">Selected: {(Array.isArray(workLogAttachments) ? workLogAttachments : []).length} file(s) (max 5)</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(Array.isArray(workLogAttachments) ? workLogAttachments : []).map((f) => (
                      <li key={fileKey(f) || `${f?.name}-${f?.size}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(f?.name || 'file')}
                        </span>
                        <button
                          className="admin-icon-button danger"
                          type="button"
                          aria-label="Remove file"
                          onClick={() => setWorkLogAttachments((prev) => (Array.isArray(prev) ? prev.filter((x) => fileKey(x) !== fileKey(f)) : []))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <button className="admin-button secondary" type="button" onClick={() => setWorkLogAttachments([])}>
                      Clear attachments
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="admin-actions">
          <button className="admin-button" type="button" onClick={saveToday} disabled={isWorkDateLocked}>
            {isWorkDateLocked ? 'Submitted' : 'Submit work log'}
          </button>
        </div>
      </div>

      {submittedModalOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setSubmittedModalOpen(false)}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Submitted work log" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Submitted work log — {workDate}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={() => setSubmittedModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {submittedAtLabel ? <p className="admin-subtitle" style={{ margin: 0 }}>Submitted at {submittedAtLabel} ({staffTimeZone || 'UTC'}).</p> : null}
                <div>
                  <h4 style={{ margin: 0 }}>Summary</h4>
                  <TaskContent text={workDateLog?.payload?.summary || '—'} style={{ margin: '8px 0 0 0' }} />
                </div>
                {(Array.isArray(workDateLog?.payload?.attachments) ? workDateLog.payload.attachments : []).length > 0 ? (
                  <div>
                    <h4 style={{ margin: 0 }}>Attachments</h4>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
                      {(Array.isArray(workDateLog?.payload?.attachments) ? workDateLog.payload.attachments : []).map((a, idx) => (
                        <li key={`${a?.filename || a?.url || idx}`}>
                          <a href={String(a?.url || '#')} target="_blank" rel="noreferrer">
                            {String(a?.original_name || a?.filename || `Attachment ${idx + 1}`)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {String(workDateLog?.payload?.reason || '').trim() ? (
                  <div>
                    <h4 style={{ margin: 0 }}>Reason</h4>
                    <p style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap' }}>{String(workDateLog?.payload?.reason || '').trim()}</p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={() => setSubmittedModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            My Month Logs{selectedMonthName ? ` — ${selectedMonthName}` : ''}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value || year))} style={{ width: 90 }} />
            <select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} style={{ minWidth: 160 }}>
              {monthNames.map((name, idx) => (
                <option key={name} value={String(idx + 1)}>
                  {name}
                </option>
              ))}
            </select>
            <button className="admin-button info" type="button" onClick={loadMonth}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading month logs..." />
        ) : monthLogs.length === 0 ? (
          <EmptyState title="No logs yet" body="Your saved daily logs will appear here." />
        ) : (
          <DataTable
            rows={monthLogs}
            getRowId={(r) => r.id}
            initialSortKey="work_date"
            initialSortDir="desc"
            columns={[
              {
                key: 'work_date',
                header: 'Date',
                sortable: true,
                filterable: true,
                accessor: (r) => r.work_date,
                sortValue: (r) => r.work_date,
                width: 140,
              },
              {
                key: 'summary',
                header: 'Summary',
                sortable: true,
                filterable: true,
                accessor: (r) => stripHtml(r.payload?.summary || ''),
                sortValue: (r) => stripHtml(r.payload?.summary || '').toLowerCase(),
                cellStyle: () => ({ maxWidth: 520, whiteSpace: 'pre-wrap' }),
              },
              {
                key: 'action',
                header: 'Action',
                sortable: false,
                filterable: false,
                searchable: false,
                width: 120,
                render: (r) => (
                  <button className="admin-button secondary" type="button" onClick={() => openMonthLogView(r)}>
                    View
                  </button>
                ),
              },
            ]}
          />
        )}
      </div>

      {monthViewOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeMonthLogView}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Work log details" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{monthViewDate ? `Work log — ${monthViewDate}` : 'Work log'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeMonthLogView}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              {monthViewLoading ? (
                <LoadingState label="Loading details..." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <h4 style={{ margin: 0 }}>Summary</h4>
                    <TaskContent text={selectedLog?.payload?.summary || '—'} style={{ margin: '8px 0 0 0' }} />
                  </div>

                  {(Array.isArray(selectedLog?.payload?.attachments) ? selectedLog.payload.attachments : []).length > 0 ? (
                    <div>
                      <h4 style={{ margin: 0 }}>Attachments</h4>
                      <ul style={{ margin: '8px 0 0 0', paddingLeft: 18 }}>
                        {(Array.isArray(selectedLog?.payload?.attachments) ? selectedLog.payload.attachments : []).map((a, idx) => (
                          <li key={`${a?.filename || a?.url || idx}`}>
                            <a href={String(a?.url || '#')} target="_blank" rel="noreferrer">
                              {String(a?.original_name || a?.filename || `Attachment ${idx + 1}`)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <h4 style={{ margin: 0 }}>Tasks</h4>
                    {(() => {
                      const tasks = Array.isArray(selectedLog?.tasks)
                        ? selectedLog.tasks
                        : Array.isArray(monthViewPlan?.tasks)
                          ? monthViewPlan.tasks
                          : [];
                      if (tasks.length === 0) {
                        return (
                          <p className="admin-subtitle" style={{ margin: '8px 0 0 0' }}>
                            No tasks recorded for this date.
                          </p>
                        );
                      }
                      return (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {tasks.map((t, idx) => (
                            <div key={t.id || `${t.title}-${idx}`} className="admin-card" style={{ padding: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                  <div style={{ fontWeight: 900, marginTop: 1 }}>{idx + 1}.</div>
                                  <TaskContent text={taskTextLabel(t) || 'Task'} style={{ margin: 0, fontWeight: 650 }} />
                                </div>
                                <span className={`admin-badge ${t.is_completed ? 'success' : 'warning'}`}>
                                  {t.is_completed ? 'Done' : 'Open'}
                                </span>
                              </div>

                              {(Array.isArray(t.proof_links) ? t.proof_links : []).length > 0 ? (
                                <div style={{ marginTop: 8 }}>
                                  <p className="admin-subtitle" style={{ margin: 0 }}>
                                    Proof links
                                  </p>
                                  <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
                                    {(Array.isArray(t.proof_links) ? t.proof_links : []).map((lnk) => (
                                      <li key={lnk}>
                                        <a href={lnk} target="_blank" rel="noreferrer">
                                          {lnk}
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {String(t.unfinished_reason || '').trim() ? (
                                <div style={{ marginTop: 8 }}>
                                  <p className="admin-subtitle" style={{ margin: 0 }}>
                                    Unfinished reason
                                  </p>
                                  <p style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>{String(t.unfinished_reason || '').trim()}</p>
                                </div>
                              ) : null}

                              {String(t.completion_note || '').trim() ? (
                                <div style={{ marginTop: 8 }}>
                                  <p className="admin-subtitle" style={{ margin: 0 }}>
                                    Note
                                  </p>
                                  <TaskContent text={t.completion_note} style={{ margin: '6px 0 0 0' }} />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <h4 style={{ margin: 0, color: '#6a1b9a', fontWeight: 900 }}>Feedback</h4>
                    {(Array.isArray(selectedLog?.comments) ? selectedLog.comments : []).length === 0 ? (
                      <p className="admin-subtitle" style={{ margin: '8px 0 0 0' }}>
                        No feedback yet.
                      </p>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(Array.isArray(selectedLog?.comments) ? selectedLog.comments : []).map((c) => (
                          <div
                            key={c.id}
                            className="admin-card"
                            style={{
                              padding: 12,
                              background: 'linear-gradient(180deg, rgba(106, 27, 154, 0.08), rgba(106, 27, 154, 0.02))',
                              border: '1px solid rgba(106, 27, 154, 0.18)',
                            }}
                          >
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#1f2d3d' }}>{c.comment}</p>
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0', color: '#6a1b9a' }}>
                              {c.created_at || ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeMonthLogView}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unfinishedModalOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeUnfinishedModal}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Mark unfinished" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Mark unfinished</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeUnfinishedModal}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  Add a short reason. Admin/HR can see this when reviewing your work log.
                </p>
                <div className="admin-field">
                  <label>Reason</label>
                  <textarea
                    value={unfinishedReason}
                    onChange={(e) => {
                      const next = String(e.target.value || '');
                      setUnfinishedReason(next.slice(0, MAX_UNFINISHED_REASON_CHARS));
                      setUnfinishedError('');
                    }}
                    rows={4}
                    placeholder="Why is this task unfinished?"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <p className="admin-subtitle" style={{ margin: 0 }}>
                      {unfinishedReason.length}/{MAX_UNFINISHED_REASON_CHARS}
                      {unfinishedReason.length >= MAX_UNFINISHED_REASON_CHARS ? ' â€” max characters reached' : ''}
                    </p>
                    {unfinishedError ? (
                      <p className="admin-subtitle" style={{ margin: 0, color: '#b71c1c', fontWeight: 800 }}>
                        {unfinishedError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeUnfinishedModal}>
                Cancel
              </button>
              <button className="admin-button" type="button" onClick={saveUnfinishedReason}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeConfirm}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Confirm action" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{confirmTitle || 'Confirm'}</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeConfirm}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{confirmBody || 'Are you sure?'}</p>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button secondary" type="button" onClick={closeConfirm}>
                Cancel
              </button>
              <button className={confirmCtaClassName} type="button" onClick={runConfirm}>
                {confirmCtaLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {taskEditOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeTaskEdit}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Edit task" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Edit task</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeTaskEdit}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-field">
                <label>Date</label>
                <input type="date" value={taskEditDate} onChange={(e) => setTaskEditDate(e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Task</label>
                <textarea value={taskEditText} onChange={(e) => setTaskEditText(e.target.value)} rows={6} placeholder="Task text..." />
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeTaskEdit} disabled={taskEditSaving}>
                Close
              </button>
              <button
                className="admin-button"
                type="button"
                onClick={saveTaskEdit}
                disabled={taskEditSaving || !(typeof taskEditText === 'string' && taskEditText.trim()) || !taskEditDate}
              >
                {taskEditSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {milestoneEditOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeMilestoneEdit}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Edit milestone" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Edit milestone</h3>
              <button className="admin-icon-button danger" type="button" aria-label="Close" onClick={closeMilestoneEdit}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-field">
                <label>Title</label>
                <input value={milestoneEditTitle} onChange={(e) => setMilestoneEditTitle(e.target.value)} placeholder="Milestone title..." />
              </div>
              <div className="admin-field">
                <label>Description (optional)</label>
                <textarea
                  value={milestoneEditDescription}
                  onChange={(e) => setMilestoneEditDescription(e.target.value)}
                  rows={4}
                  placeholder="Details..."
                />
              </div>
            </div>
            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="admin-button danger" type="button" onClick={closeMilestoneEdit} disabled={milestoneEditSaving}>
                Close
              </button>
              <button className="admin-button" type="button" onClick={saveMilestoneEdit} disabled={milestoneEditSaving || !String(milestoneEditTitle || '').trim()}>
                {milestoneEditSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {false ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Manager tools</h3>
              <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                You’re seeing this because your account can manage work plans. Use it to schedule tasks and milestones for staff.
              </p>
            </div>
            <button className="admin-button info" type="button" onClick={() => setManagerToolsOpen((v) => !v)}>
              {managerToolsOpen ? 'Hide' : 'Show'}
            </button>
          </div>

          {managerToolsOpen ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 12 }}>
            <div className="admin-card" style={{ padding: 14 }}>
              <h4 style={{ margin: 0 }}>Schedule task</h4>
              {managerMessage ? (
                <div className={`admin-alert ${managerMessageTone}`} style={{ marginTop: 12, marginBottom: 12 }}>
                  {managerMessage}
                </div>
              ) : null}
              <div className="admin-field" style={{ marginTop: 10 }}>
                <label>Staff</label>
                <select value={assignStaffUserId} onChange={(e) => setAssignStaffUserId(e.target.value)}>
                  <option value="">Select staff...</option>
                  {(Array.isArray(staffUsers) ? staffUsers : []).map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label>Schedule date</label>
                <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
              </div>
              <div className="admin-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="admin-button secondary" type="button" onClick={() => setAssignDate(todayISO())}>
                  Today
                </button>
                <button className="admin-button secondary" type="button" onClick={() => setAssignDate(isoDateAddDays(todayISO(), 1))}>
                  Tomorrow
                </button>
                <button className="admin-button secondary" type="button" onClick={() => setAssignDate(mondayOfWeek(new Date()))}>
                  Next Monday
                </button>
              </div>
              <div className="admin-field">
                <label>Role (bulk assign)</label>
                <select value={assignRoleKey} onChange={(e) => setAssignRoleKey(e.target.value)} disabled={rolesLoading}>
                  <option value="">Select role...</option>
                  {(Array.isArray(roleItems) ? roleItems : []).map((r) => (
                    <option key={r.key} value={String(r.key)}>
                      {r.name || r.key}
                    </option>
                  ))}
                </select>
                <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                  Use "Assign to role" to send this task to every active staff in that role.
                </p>
              </div>
              <div className="admin-field">
                <label>Task</label>
                <textarea
                  value={assignText}
                  onChange={(e) => setAssignText(e.target.value)}
                  rows={4}
                  placeholder="Task for this staff... (multi-line supported)"
                />
              </div>
              <div className="admin-actions">
                <button
                  className="admin-button"
                  type="button"
                  onClick={assignTask}
                  disabled={assignLoading || assignRoleLoading || !(typeof assignText === 'string' && assignText.trim()) || !assignStaffUserId}
                >
                  {assignLoading ? 'Assigning…' : 'Assign'}
                </button>
                <button
                  className="admin-button warning"
                  type="button"
                  onClick={assignTaskToRole}
                  disabled={assignLoading || assignRoleLoading || !(typeof assignText === 'string' && assignText.trim()) || !String(assignRoleKey || '').trim()}
                >
                  {assignRoleLoading ? 'Assigning…' : 'Assign to role'}
                </button>
                <button className="admin-button info" type="button" onClick={loadManageTasks} disabled={manageTaskLoading || !assignDate}>
                  {manageTaskLoading ? 'Loading…' : 'Load tasks'}
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                {(Array.isArray(manageTaskItems) ? manageTaskItems : []).length === 0 ? (
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    No scheduled tasks loaded.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {manageTaskItems.map((t) => (
                      <div key={t.id} className="admin-card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <TaskContent text={taskTextLabel(t) || 'Task'} style={{ margin: 0, fontWeight: 800 }} />
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                              Staff: {t.staff_user_id || '—'} • Date: {String(t.work_date || '').slice(0, 10)} • Status: {t.is_completed ? 'Done' : 'Open'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="admin-button info" type="button" onClick={() => openTaskEdit(t)}>
                              Edit
                            </button>
                            <button
                              className="admin-button danger"
                              type="button"
                              onClick={() =>
                                openConfirm({
                                  title: 'Delete task?',
                                  body: 'This will remove the task from staff view (soft delete).',
                                  onConfirm: () => deleteManageTask(t.id),
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-card" style={{ padding: 14 }}>
              <div className="admin-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Role milestones</h4>
                <button className="admin-button info" type="button" onClick={loadMilestones} disabled={milestoneLoading}>
                  {milestoneLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>Role</label>
                  <select value={milestoneRoleKey} onChange={(e) => setMilestoneRoleKey(e.target.value)} disabled={rolesLoading}>
                    {(Array.isArray(roleItems) ? roleItems : []).map((r) => (
                      <option key={r.key} value={String(r.key)}>
                        {r.name || r.key}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field" style={{ margin: 0 }}>
                  <label>Cadence</label>
                  <select
                    value={milestoneCadence}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMilestoneCadence(next);
                      setMilestonePeriodStart(next === 'monthly' ? monthStartISO(now) : mondayOfWeek(now));
                    }}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div className="admin-field">
                <label>Period start</label>
                <input type="date" value={milestonePeriodStart} onChange={(e) => setMilestonePeriodStart(e.target.value)} />
              </div>
              <div className="admin-field">
                <label>Title</label>
                <input value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Milestone title..." />
              </div>
              <div className="admin-field">
                <label>Description (optional)</label>
                <textarea value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} rows={3} placeholder="Details..." />
              </div>
              <div className="admin-actions">
                <button className="admin-button" type="button" onClick={createMilestone} disabled={!String(milestoneTitle || '').trim() || !milestoneRoleKey}>
                  Create
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                {(Array.isArray(milestoneItems) ? milestoneItems : []).length === 0 ? (
                  <p className="admin-subtitle" style={{ margin: 0 }}>
                    No milestones for this period.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {milestoneItems.map((m) => (
                      <div key={m.id} className="admin-card" style={{ padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontWeight: 700 }}>{m.title}</p>
                            {m.description ? (
                              <p className="admin-subtitle" style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>
                                {m.description}
                              </p>
                            ) : null}
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                              Status: {m.is_completed ? 'Done' : 'Open'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="admin-button info" type="button" onClick={() => openMilestoneEdit(m)}>
                              Edit
                            </button>
                            {m.is_completed ? (
                              <button className="admin-button secondary" type="button" onClick={() => setMilestoneDone(m.id, false)}>
                                Reopen
                              </button>
                            ) : (
                              <button className="admin-button" type="button" onClick={() => setMilestoneDone(m.id, true)}>
                                Mark done
                              </button>
                            )}
                            <button
                              className="admin-button danger"
                              type="button"
                              onClick={() =>
                                openConfirm({
                                  title: 'Delete milestone?',
                                  body: 'This will remove the milestone from staff view (soft delete).',
                                  onConfirm: () => deleteMilestoneRow(m.id),
                                })
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : null}
        </div>
      ) : null}

      {isManager ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>HR/Admin: Missing work logs (all staff)</h3>
          <p className="admin-subtitle">Shows days where staff clocked in but didn’t submit a work log.</p>

          <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Week start
              <input type="date" value={allWeekStart} onChange={(e) => setAllWeekStart(e.target.value)} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={missingAllUnremindedOnly} onChange={(e) => setMissingAllUnremindedOnly(e.target.checked)} />
              Unreminded only
            </label>
            <button className="admin-button info" type="button" onClick={loadMissingAll} disabled={missingAllLoading}>
              {missingAllLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button className="admin-button warning" type="button" onClick={bulkRemindAllMissing} disabled={bulkAllLoading}>
              {bulkAllLoading ? 'Sending...' : 'Remind everyone missing'}
            </button>
          </div>

          {missingAllLoading ? (
            <div style={{ marginTop: 12 }}>
              <LoadingState label="Loading missing logs..." />
            </div>
          ) : (Array.isArray(missingAllItems) ? missingAllItems : []).length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState title="No missing logs" body="No missing work logs found for this week." />
            </div>
          ) : (
            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Staff</th>
                    <th>Clock-in</th>
                    <th>Reminded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(missingAllItems) ? missingAllItems : [])
                    .filter((r) => (missingAllUnremindedOnly ? !r.reminded : true))
                    .filter((r) => {
                      const q = String(staffSearch || '').trim().toLowerCase();
                      if (!q) return true;
                      return String(r.email || '').toLowerCase().includes(q) || String(r.full_name || '').toLowerCase().includes(q);
                    })
                    .map((r) => (
                      <tr key={`${r.staff_user_id}:${r.work_date}`}>
                        <td>{r.work_date}</td>
                        <td>{r.full_name ? `${r.full_name} (${r.email})` : r.email}</td>
                        <td>{r.clock_in_at ? String(r.clock_in_at).slice(11, 19) : '-'}</td>
                        <td>{r.reminded ? 'Yes' : 'No'}</td>
                        <td>
                          {!r.reminded ? (
                            <button className="admin-button" type="button" onClick={() => sendReminderFor(r.staff_user_id, r.work_date)}>
                              Send reminder
                            </button>
                          ) : (
                            <span className="admin-subtitle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-field" style={{ marginTop: 12 }}>
            <label>Search staff</label>
            <input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Search by name or email..." />
          </div>
        </div>
      ) : null}

      {isManager ? (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>HR/Admin: Weekly Review</h3>
          <p className="admin-subtitle">Filter by staff, review weekly logs, add feedback, and record reminders for missing logs.</p>

          <div className="admin-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Staff
              <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={{ minWidth: 280 }}>
                {staffUsers
                  .filter((u) => {
                    const q = String(staffSearch || '').trim().toLowerCase();
                    if (!q) return true;
                    return String(u.email || '').toLowerCase().includes(q) || String(u.full_name || '').toLowerCase().includes(q);
                  })
                  .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.timezone})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Week start
              <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              Missing only
            </label>
            <button className="admin-button info" type="button" onClick={loadWeek} disabled={!staffUserId}>
              Refresh
            </button>
            <button className="admin-button warning" type="button" onClick={bulkRemindMissing} disabled={!staffUserId || bulkRemindLoading}>
              {bulkRemindLoading ? 'Sending...' : 'Remind all missing'}
            </button>
          </div>

          {weekLoading ? (
            <div style={{ marginTop: 12 }}>
              <LoadingState label="Loading week summary..." />
            </div>
          ) : !weekData ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState title="No staff selected" body="Pick a staff member to view weekly summaries and reminders." />
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="admin-card admin-card--subtle admin-card--compact">
                <p className="admin-subtitle" style={{ margin: 0 }}>
                  <strong>{weekData.email}</strong> — {weekData.week_start} → {weekData.week_end} | Logs: {weekData.summary?.logs_written} | Missing:{' '}
                  {weekData.summary?.missing_logs} | Comments: {weekData.summary?.comments_total} | Reminders: {weekData.summary?.reminders_total}
                </p>
              </div>

              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Attendance</th>
                      <th>Summary</th>
                      <th>Comments</th>
                      <th>Reminder</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(weekData.days) ? weekData.days : []).filter((d) => (missingOnly ? d.missing_log : true)).map((d) => (
                      <tr key={d.work_date} style={d.missing_log ? { background: 'rgba(255, 99, 71, 0.10)' } : undefined}>
                        <td>{d.work_date}</td>
                        <td>{d.attendance?.clock_in_at ? 'Clocked in' : '—'}</td>
                        <td style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{stripHtml(d.work_log?.payload?.summary || '') || (d.missing_log ? 'Missing log' : '—')}</td>
                        <td>{d.comments_count || 0}</td>
                        <td>{d.reminder ? 'Sent' : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {d.work_log?.id ? (
                              <button className="admin-button secondary" type="button" onClick={() => loadLogDetail(d.work_log.id)}>
                                View
                              </button>
                            ) : null}
                            {d.missing_log && !d.reminder ? (
                              <button className="admin-button" type="button" onClick={() => sendReminder(d.work_date)}>
                                Record reminder
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedLog ? (
                <div className="admin-card" style={{ marginTop: 16, padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Feedback</h4>
                  <p className="admin-subtitle" style={{ marginTop: 6 }}>
                    Work log #{selectedLog.id} — {selectedLog.work_date}
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <TaskContent text={selectedLog.payload?.summary || ''} style={{ margin: 0 }} />
                  </div>

                  {(Array.isArray(selectedLog.payload?.attachments) ? selectedLog.payload.attachments : []).length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="admin-subtitle" style={{ margin: 0 }}>
                        Attachments
                      </p>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
                        {(Array.isArray(selectedLog.payload?.attachments) ? selectedLog.payload.attachments : []).map((a, idx) => (
                          <li key={`${a?.filename || a?.url || idx}`}>
                            <a href={String(a?.url || '#')} target="_blank" rel="noreferrer">
                              {String(a?.original_name || a?.filename || `Attachment ${idx + 1}`)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {String(selectedLog.payload?.reason || '').trim() ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="admin-subtitle" style={{ margin: 0 }}>
                        Reason
                      </p>
                      <p style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>{String(selectedLog.payload?.reason || '').trim()}</p>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 14 }}>
                    <h5 style={{ margin: 0 }}>Tasks</h5>
                    {(Array.isArray(selectedLog.tasks) ? selectedLog.tasks : []).length === 0 ? (
                      <p className="admin-subtitle" style={{ margin: '8px 0 0 0' }}>
                        No tasks recorded for this date.
                      </p>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(Array.isArray(selectedLog.tasks) ? selectedLog.tasks : []).map((t, idx) => (
                          <div key={t.id || `${t.title}-${idx}`} className="admin-card admin-card--subtle" style={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ fontWeight: 900, marginTop: 1 }}>{idx + 1}.</div>
                                <TaskContent text={taskTextLabel(t) || 'Task'} style={{ margin: 0, fontWeight: 650 }} />
                              </div>
                              <span className={`admin-badge ${t.is_completed ? 'success' : 'warning'}`}>
                                {t.is_completed ? 'Done' : 'Open'}
                              </span>
                            </div>

                            {(Array.isArray(t.proof_links) ? t.proof_links : []).length > 0 ? (
                              <div style={{ marginTop: 8 }}>
                                <p className="admin-subtitle" style={{ margin: 0 }}>
                                  Proof links
                                </p>
                                <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
                                  {(Array.isArray(t.proof_links) ? t.proof_links : []).map((lnk) => (
                                    <li key={lnk}>
                                      <a href={lnk} target="_blank" rel="noreferrer">
                                        {lnk}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {String(t.unfinished_reason || '').trim() ? (
                              <div style={{ marginTop: 8 }}>
                                <p className="admin-subtitle" style={{ margin: 0 }}>
                                  Unfinished reason
                                </p>
                                <p style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap' }}>{String(t.unfinished_reason || '').trim()}</p>
                              </div>
                            ) : null}

                            {String(t.completion_note || '').trim() ? (
                              <div style={{ marginTop: 8 }}>
                                <p className="admin-subtitle" style={{ margin: 0 }}>
                                  Note
                                </p>
                                <TaskContent text={t.completion_note} style={{ margin: '6px 0 0 0' }} />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <h5 style={{ margin: 0 }}>Comments</h5>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Array.isArray(selectedLog.comments) ? selectedLog.comments : []).length === 0 ? (
                        <p className="admin-subtitle" style={{ margin: 0 }}>
                          No feedback yet.
                        </p>
                      ) : (
                        (Array.isArray(selectedLog.comments) ? selectedLog.comments : []).map((c) => (
                          <div key={c.id} className="admin-card" style={{ padding: 10 }}>
                            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.comment}</p>
                            <p className="admin-subtitle" style={{ margin: '6px 0 0 0' }}>
                              {c.created_at || ''}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="admin-field">
                      <label>Add feedback</label>
                      <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} rows={3} placeholder="Write feedback for this day..." />
                    </div>
                    <div className="admin-actions">
                      <button className="admin-button" type="button" onClick={addFeedback} disabled={!String(commentDraft || '').trim()}>
                        Add comment
                      </button>
                      <button
                        className="admin-button secondary"
                        type="button"
                        onClick={() => {
                          setSelectedLogId(null);
                          setSelectedLog(null);
                          setCommentDraft('');
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-card">
          <LoadingState label="Loading work logs…" />
        </div>
      }
    >
      <WorkLogsPageInner />
    </Suspense>
  );
}
