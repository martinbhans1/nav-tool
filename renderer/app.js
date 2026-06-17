// Renderer logic. Local-only state, persisted via window.api (IPC → disk).
// Contacts (initials only) are the shared entity linked across the month grid,
// tasks, and referat reminders. DOM built with textContent (no innerHTML on
// user data) → no injection risk.

'use strict';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const PRIO_LABEL = { low: 'Lav', normal: 'Normal', high: 'Høy' };
const PRIO_RANK = { high: 0, normal: 1, low: 2 };
const CHECK_SVG =
  '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  const base = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${String(d.getFullYear()).slice(2)}`;
}
const isOverdue = (s) => !!s && s < todayStr();
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------- theming ----------
const SHADOW_LIGHT = '0 1px 2px rgba(20,28,45,.04), 0 6px 20px rgba(20,28,45,.06)';
const SHADOW_DARK = '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.32)';
const THEMES = {
  lys:      { name: 'Lys',      bg: '#f5f6f8', panel: '#ffffff', ink: '#1b2230', muted: '#6b7480', faint: '#9aa3af', line: '#e6e8ec', lineStrong: '#d8dbe1', accent: '#4f46e5', shadow: SHADOW_LIGHT },
  rosa:     { name: 'Rosa',     bg: '#fdf4f7', panel: '#fffafc', ink: '#3b2530', muted: '#8a6b76', faint: '#bd9aa6', line: '#f4e2e9', lineStrong: '#ecd2dd', accent: '#db2777', shadow: '0 1px 2px rgba(80,20,45,.05), 0 6px 20px rgba(120,30,70,.08)' },
  lavendel: { name: 'Lavendel', bg: '#f6f4fd', panel: '#fffdff', ink: '#2c2440', muted: '#756b8a', faint: '#a99fc0', line: '#e9e3f6', lineStrong: '#ddd4ef', accent: '#7c3aed', shadow: SHADOW_LIGHT },
  sand:     { name: 'Sand',     bg: '#f7f4ee', panel: '#fffdf8', ink: '#2f2a22', muted: '#7d7361', faint: '#b3a995', line: '#ece5d8', lineStrong: '#e0d7c4', accent: '#b4530a', shadow: SHADOW_LIGHT },
  mynte:    { name: 'Mynte',    bg: '#eef7f2', panel: '#fbfffd', ink: '#1c2a26', muted: '#5f7a70', faint: '#9bb5aa', line: '#dcebe4', lineStrong: '#cce0d6', accent: '#0d9488', shadow: SHADOW_LIGHT },
  fersken:  { name: 'Fersken',  bg: '#fdf3ed', panel: '#fffbf8', ink: '#3a2820', muted: '#8a6f60', faint: '#c2a795', line: '#f5e3d8', lineStrong: '#eed5c6', accent: '#e0603a', shadow: SHADOW_LIGHT },
  kontrast: { name: 'Kontrast', bg: '#ffffff', panel: '#ffffff', ink: '#000000', muted: '#2b2b2b', faint: '#555555', line: '#161616', lineStrong: '#000000', accent: '#1d4ed8', shadow: 'none' },
  mork:     { name: 'Mørk',     bg: '#14161b', panel: '#1c1f26', ink: '#e7eaf0', muted: '#9aa3b2', faint: '#6b7280', line: '#2a2e37', lineStrong: '#363b46', accent: '#818cf8', shadow: SHADOW_DARK },
  grafitt:  { name: 'Grafitt',  bg: '#1a1c1f', panel: '#232629', ink: '#e8eaed', muted: '#9aa0a8', faint: '#6a7078', line: '#2f3338', lineStrong: '#3b4046', accent: '#7aa2c9', shadow: SHADOW_DARK },
  hav:      { name: 'Hav',      bg: '#0f1720', panel: '#16212c', ink: '#e2ecf2', muted: '#8aa0b0', faint: '#5f7180', line: '#22323f', lineStrong: '#2e4150', accent: '#2dd4bf', shadow: SHADOW_DARK },
};
const FONTS = [
  { key: 'system',  label: 'System',   stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif' },
  { key: 'rounded', label: 'Avrundet', stack: 'ui-rounded, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif' },
  { key: 'serif',   label: 'Serif',    stack: 'Georgia, "Times New Roman", serif' },
  { key: 'verdana', label: 'Verdana',  stack: 'Verdana, Geneva, Tahoma, sans-serif' },
  { key: 'mono',    label: 'Mono',     stack: '"Cascadia Code", Consolas, "Courier New", ui-monospace, monospace' },
];
const ACCENTS = ['#4f46e5', '#db2777', '#7c3aed', '#2563eb', '#0ea5a4', '#16a34a', '#d97706', '#e11d48', '#0891b2', '#475569'];

function defaultSettings() {
  return { theme: 'lys', accent: '', font: 'system', scale: 100, radius: 12,
           density: 'comfortable', readingSize: 14, background: 'flat', contacted: 'green' };
}

function defaultState() {
  return {
    version: 2,
    view: 'oversikt',
    year: new Date().getFullYear(),
    contacts: [],          // [{ id, initials }]
    contacted: {},         // { contactId: { [year]: [bool x12] } }
    tasks: [],             // [{ id, title, note, due, priority, contactId, done, createdAt, doneAt }]
    referater: [],         // [{ id, title, note, date, contactId, done, createdAt, doneAt }]
    summary: '',
    settings: defaultSettings(),
  };
}

// Accept v1 (persons/todos) and v2; always return a safe, complete v2 blob.
function normalize(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  const contacts = Array.isArray(s.contacts) ? s.contacts
    : Array.isArray(s.persons) ? s.persons : [];
  const tasksSrc = Array.isArray(s.tasks) ? s.tasks
    : Array.isArray(s.todos) ? s.todos : [];
  return {
    version: 2,
    view: typeof s.view === 'string' ? s.view : 'oversikt',
    year: Number.isInteger(s.year) ? s.year : d.year,
    contacts: contacts.filter(c => c && c.id).map(c => ({ id: c.id, initials: String(c.initials || '').slice(0, 6) })),
    contacted: (s.contacted && typeof s.contacted === 'object') ? s.contacted : {},
    tasks: tasksSrc.filter(t => t && t.id).map(t => ({
      id: t.id,
      title: String(t.title != null ? t.title : (t.text || '')),  // v1 todo.text → title
      note: String(t.note || ''),
      due: t.due || '',
      priority: ['low', 'normal', 'high'].includes(t.priority) ? t.priority : 'normal',
      contactId: t.contactId || t.assignee || null,               // v1 todo.assignee → contactId
      done: !!t.done, createdAt: t.createdAt || Date.now(), doneAt: t.doneAt || null,
    })),
    referater: (Array.isArray(s.referater) ? s.referater : []).filter(r => r && r.id).map(r => ({
      id: r.id, title: String(r.title || ''), note: String(r.note || ''),
      date: r.date || '', contactId: r.contactId || null,
      done: !!r.done, createdAt: r.createdAt || Date.now(), doneAt: r.doneAt || null,
    })),
    summary: typeof s.summary === 'string' ? s.summary : '',
    settings: (() => {
      const si = (s.settings && typeof s.settings === 'object') ? s.settings : {};
      const def = defaultSettings();
      return {
        theme: THEMES[si.theme] ? si.theme : def.theme,
        accent: /^#[0-9a-fA-F]{6}$/.test(si.accent || '') ? si.accent : '',
        font: FONTS.some(f => f.key === si.font) ? si.font : def.font,
        scale: Number.isFinite(si.scale) ? clamp(si.scale, 85, 130) : def.scale,
        radius: Number.isFinite(si.radius) ? clamp(si.radius, 0, 22) : def.radius,
        density: ['comfortable', 'compact'].includes(si.density) ? si.density : def.density,
        readingSize: Number.isFinite(si.readingSize) ? clamp(si.readingSize, 12, 18) : def.readingSize,
        background: ['flat', 'gradient', 'dots'].includes(si.background) ? si.background : def.background,
        contacted: ['green', 'accent'].includes(si.contacted) ? si.contacted : def.contacted,
      };
    })(),
  };
}

let state = defaultState();

// ---------- persistence ----------
let saveTimer = null;
const saveStateEl = document.getElementById('saveState');
function scheduleSave() {
  saveStateEl.textContent = 'Lagrer…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ok = await window.api.save(state);
    saveStateEl.textContent = ok ? 'Lagret' : 'Feil ved lagring';
    if (ok) setTimeout(() => { if (saveStateEl.textContent === 'Lagret') saveStateEl.textContent = ''; }, 1400);
  }, 250);
}

// ---------- contacts (shared) ----------
function contactById(id) { return state.contacts.find(c => c.id === id) || null; }
function initialsFor(id) { const c = contactById(id); return c ? c.initials : null; }

// Find a contact by initials, or create one. '' → null. Re-renders dependents.
function resolveContact(raw) {
  const v = (raw || '').trim().toUpperCase().slice(0, 6);
  if (!v) return null;
  let c = state.contacts.find(x => x.initials.toUpperCase() === v);
  if (!c) {
    c = { id: uid(), initials: v };
    state.contacts.push(c);
    renderGrid(); renderContactsDatalist();
  }
  return c.id;
}
function addContact(raw) {
  const before = state.contacts.length;
  const id = resolveContact(raw);
  if (id && state.contacts.length > before) scheduleSave(); // only persist on a real new contact
  return id;
}
function deleteContact(id) {
  const c = contactById(id);
  if (!c) return;
  if (!confirm('Fjerne ' + c.initials + '? Kontakt-historikk slettes, og koblinger i gjøremål/referat fjernes.')) return;
  state.contacts = state.contacts.filter(x => x.id !== id);
  delete state.contacted[id];
  state.tasks.forEach(t => { if (t.contactId === id) t.contactId = null; });
  state.referater.forEach(r => { if (r.contactId === id) r.contactId = null; });
  renderGrid(); renderContactsDatalist(); renderTasks(); renderReferat();
  scheduleSave();
}
function renderContactsDatalist() {
  const dl = document.getElementById('contactsList');
  dl.textContent = '';
  state.contacts.forEach(c => { const o = document.createElement('option'); o.value = c.initials; dl.appendChild(o); });
}

// ---------- month grid ----------
function cellGet(pid, year, m) { const a = state.contacted[pid] && state.contacted[pid][year]; return !!(a && a[m]); }
function cellSet(pid, year, m, v) {
  if (!state.contacted[pid]) state.contacted[pid] = {};
  if (!Array.isArray(state.contacted[pid][year])) state.contacted[pid][year] = new Array(12).fill(false);
  state.contacted[pid][year][m] = v;
}
function renderGrid() {
  const head = document.getElementById('gridHead'), body = document.getElementById('gridBody'), foot = document.getElementById('gridFoot');
  const empty = document.getElementById('gridEmpty'), table = document.getElementById('grid');
  head.textContent = ''; body.textContent = ''; foot.textContent = '';
  if (!state.contacts.length) { empty.classList.remove('hidden'); table.classList.add('hidden'); return; }
  empty.classList.add('hidden'); table.classList.remove('hidden');

  const htr = document.createElement('tr');
  const hn = document.createElement('th'); hn.className = 'name-col'; hn.textContent = 'Person'; htr.appendChild(hn);
  MONTHS.forEach(m => { const th = document.createElement('th'); th.textContent = m; htr.appendChild(th); });
  head.appendChild(htr);

  state.contacts.forEach(p => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td'); nameTd.className = 'name-col';
    const wrap = document.createElement('div'); wrap.className = 'person-cell';
    const ini = document.createElement('span'); ini.className = 'person-initials'; ini.textContent = p.initials;
    const del = document.createElement('button'); del.className = 'row-del'; del.textContent = '×'; del.title = 'Fjern person';
    del.addEventListener('click', () => deleteContact(p.id));
    wrap.append(ini, del); nameTd.appendChild(wrap); tr.appendChild(nameTd);

    for (let m = 0; m < 12; m++) {
      const td = document.createElement('td');
      const btn = document.createElement('button');
      const on = cellGet(p.id, state.year, m);
      btn.className = 'cell-btn' + (on ? ' on' : '');
      btn.title = (on ? 'Kontaktet' : 'Ikke kontaktet') + ' — ' + MONTHS[m];
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) btn.innerHTML = CHECK_SVG;
      btn.addEventListener('click', () => {
        const next = !cellGet(p.id, state.year, m);
        cellSet(p.id, state.year, m, next);
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        btn.title = (next ? 'Kontaktet' : 'Ikke kontaktet') + ' — ' + MONTHS[m];
        btn.innerHTML = next ? CHECK_SVG : '';
        renderFoot(); scheduleSave();
      });
      td.appendChild(btn); tr.appendChild(td);
    }
    body.appendChild(tr);
  });
  renderFoot();
}
function renderFoot() {
  const foot = document.getElementById('gridFoot'); foot.textContent = '';
  const total = state.contacts.length;
  const tr = document.createElement('tr');
  const lbl = document.createElement('td'); lbl.className = 'name-col'; lbl.textContent = 'Kontaktet'; tr.appendChild(lbl);
  for (let m = 0; m < 12; m++) {
    const td = document.createElement('td');
    const n = state.contacts.reduce((a, p) => a + (cellGet(p.id, state.year, m) ? 1 : 0), 0);
    const pv = total ? Math.round((n / total) * 100) : 0;
    const pct = document.createElement('div'); pct.className = 'pct' + (n === 0 ? ' zero' : ''); pct.textContent = pv + '%';
    const sub = document.createElement('div'); sub.className = 'pct-sub'; sub.textContent = n + '/' + total;
    const bar = document.createElement('div'); bar.className = 'pct-bar'; const fill = document.createElement('span'); fill.style.width = pv + '%'; bar.appendChild(fill);
    td.append(pct, sub, bar); tr.appendChild(td);
  }
  foot.appendChild(tr);
}

// ---------- shared chip/meta builders ----------
function personChip(contactId) {
  const who = initialsFor(contactId);
  if (!who) return null;
  const c = document.createElement('span'); c.className = 'chip person'; c.textContent = who; return c;
}
function dueChip(due) {
  if (!due) return null;
  const c = document.createElement('span'); c.className = 'chip due' + (isOverdue(due) ? ' overdue' : '');
  c.textContent = (isOverdue(due) ? 'Forfalt · ' : '') + fmtDate(due); return c;
}

// ---------- tasks ----------
function taskEl(t) {
  const row = document.createElement('div');
  row.className = 'item prio-' + t.priority + (t.done ? ' is-done' : '');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done;
  cb.addEventListener('change', () => { t.done = cb.checked; t.doneAt = t.done ? Date.now() : null; renderTasks(); scheduleSave(); });
  const main = document.createElement('div'); main.className = 'item-main';
  const title = document.createElement('div'); title.className = 'item-title'; title.textContent = t.title; main.appendChild(title);
  if (t.note) { const n = document.createElement('div'); n.className = 'item-note'; n.textContent = t.note; main.appendChild(n); }
  const meta = document.createElement('div'); meta.className = 'item-meta';
  const dc = dueChip(t.due); if (dc) meta.appendChild(dc);
  if (t.priority !== 'normal') { const pc = document.createElement('span'); pc.className = 'chip prio-' + t.priority; pc.textContent = PRIO_LABEL[t.priority]; meta.appendChild(pc); }
  const pc2 = personChip(t.contactId); if (pc2) meta.appendChild(pc2);
  if (meta.children.length) main.appendChild(meta);
  const del = document.createElement('button'); del.className = 'item-del'; del.textContent = '×'; del.title = 'Slett';
  del.addEventListener('click', () => { state.tasks = state.tasks.filter(x => x.id !== t.id); renderTasks(); scheduleSave(); });
  row.append(cb, main, del);
  return row;
}
function renderTasks() {
  const active = document.getElementById('taskActive'), done = document.getElementById('taskDone');
  active.textContent = ''; done.textContent = '';
  const act = state.tasks.filter(t => !t.done).sort((a, b) => {
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;       // dated first
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]; // then by priority
  });
  const fin = state.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!act.length) { const e = document.createElement('div'); e.className = 'list-empty'; e.textContent = 'Ingen aktive gjøremål.'; active.appendChild(e); }
  else act.forEach(t => active.appendChild(taskEl(t)));
  fin.forEach(t => done.appendChild(taskEl(t)));
  document.getElementById('taskDoneCount').textContent = String(fin.length);
  renderBadges();
}

// ---------- referat reminders ----------
function referatEl(r) {
  const row = document.createElement('div');
  row.className = 'item ref' + (r.done ? ' is-done' : '');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.done; cb.title = 'Marker som skrevet';
  cb.addEventListener('change', () => { r.done = cb.checked; r.doneAt = r.done ? Date.now() : null; renderReferat(); scheduleSave(); });
  const main = document.createElement('div'); main.className = 'item-main';
  const title = document.createElement('div'); title.className = 'item-title'; title.textContent = r.title; main.appendChild(title);
  if (r.note) { const n = document.createElement('div'); n.className = 'item-note'; n.textContent = r.note; main.appendChild(n); }
  const meta = document.createElement('div'); meta.className = 'item-meta';
  if (r.date) { const dc = document.createElement('span'); dc.className = 'chip due'; dc.textContent = fmtDate(r.date); meta.appendChild(dc); }
  const pc = personChip(r.contactId); if (pc) meta.appendChild(pc);
  if (meta.children.length) main.appendChild(meta);
  const del = document.createElement('button'); del.className = 'item-del'; del.textContent = '×'; del.title = 'Slett';
  del.addEventListener('click', () => { state.referater = state.referater.filter(x => x.id !== r.id); renderReferat(); scheduleSave(); });
  row.append(cb, main, del);
  return row;
}
function renderReferat() {
  const active = document.getElementById('refActive'), done = document.getElementById('refDone');
  active.textContent = ''; done.textContent = '';
  const act = state.referater.filter(r => !r.done).sort((a, b) => {
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  const fin = state.referater.filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!act.length) { const e = document.createElement('div'); e.className = 'list-empty'; e.textContent = 'Ingen påminnelser.'; active.appendChild(e); }
  else act.forEach(r => active.appendChild(referatEl(r)));
  fin.forEach(r => done.appendChild(referatEl(r)));
  document.getElementById('refDoneCount').textContent = String(fin.length);
  renderBadges();
}

// ---------- nav ----------
function renderBadges() {
  const t = state.tasks.filter(x => !x.done).length;
  const r = state.referater.filter(x => !x.done).length;
  document.getElementById('navTasks').textContent = t ? String(t) : '';
  document.getElementById('navReferat').textContent = r ? String(r) : '';
}
function setView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.dataset.view === v));
  scheduleSave();
}

// ---------- year ----------
function renderYear() { document.getElementById('yearLabel').textContent = String(state.year); }
function setYear(delta) { state.year += delta; renderYear(); renderGrid(); scheduleSave(); }

// ---------- wiring ----------
function bind() {
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => setView(n.dataset.nav)));

  document.getElementById('addContactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('contactInput');
    addContact(inp.value); inp.value = ''; inp.focus();
  });

  document.getElementById('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;
    const contactId = resolveContact(document.getElementById('taskContact').value);
    state.tasks.push({
      id: uid(), title,
      note: document.getElementById('taskNote').value.trim(),
      due: document.getElementById('taskDue').value || '',
      priority: document.getElementById('taskPriority').value || 'normal',
      contactId, done: false, createdAt: Date.now(), doneAt: null,
    });
    e.target.reset(); document.getElementById('taskPriority').value = 'normal';
    renderTasks(); document.getElementById('taskTitle').focus(); scheduleSave();
  });

  document.getElementById('addReferatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('refTitle').value.trim();
    if (!title) return;
    const contactId = resolveContact(document.getElementById('refContact').value);
    state.referater.push({
      id: uid(), title,
      note: document.getElementById('refNote').value.trim(),
      date: document.getElementById('refDate').value || '',
      contactId, done: false, createdAt: Date.now(), doneAt: null,
    });
    e.target.reset();
    renderReferat(); document.getElementById('refTitle').focus(); scheduleSave();
  });

  const sum = document.getElementById('summary');
  sum.addEventListener('input', () => { state.summary = sum.value; scheduleSave(); });

  document.getElementById('yearPrev').addEventListener('click', () => setYear(-1));
  document.getElementById('yearNext').addEventListener('click', () => setYear(1));

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const ok = await window.api.exportBackup(state);
    if (ok) { saveStateEl.textContent = 'Eksportert'; setTimeout(() => saveStateEl.textContent = '', 1500); }
  });
  document.getElementById('importBtn').addEventListener('click', async () => {
    const incoming = await window.api.importBackup();
    if (!incoming) return;
    if (!confirm('Importere data fra fil? Dette erstatter alt som ligger her nå.')) return;
    state = normalize(incoming); renderAll(); await window.api.save(state);
    saveStateEl.textContent = 'Importert'; setTimeout(() => saveStateEl.textContent = '', 1500);
  });

  bindSettings();
}

// ---------- settings: apply (CSS vars + zoom) ----------
function applySettings() {
  const st = state.settings, root = document.documentElement.style;
  const t = THEMES[st.theme] || THEMES.lys;
  root.setProperty('--bg', t.bg);
  root.setProperty('--panel', t.panel);
  root.setProperty('--ink', t.ink);
  root.setProperty('--muted', t.muted);
  root.setProperty('--faint', t.faint);
  root.setProperty('--line', t.line);
  root.setProperty('--line-strong', t.lineStrong);
  root.setProperty('--shadow', t.shadow);
  root.setProperty('--accent', st.accent || t.accent);
  const f = FONTS.find(x => x.key === st.font) || FONTS[0];
  root.setProperty('--font', f.stack);
  const r = clamp(st.radius, 0, 22);
  root.setProperty('--r', r + 'px');
  root.setProperty('--r-sm', Math.max(2, Math.round(r * 0.62)) + 'px');
  root.setProperty('--text-size', clamp(st.readingSize, 12, 18) + 'px');
  document.documentElement.style.zoom = String(clamp(st.scale, 85, 130) / 100);
  document.documentElement.dataset.density = st.density;
  document.documentElement.dataset.contacted = st.contacted;
  document.body.dataset.bg = st.background;
}

function renderSettings() {
  const st = state.settings;
  const t = THEMES[st.theme] || THEMES.lys;

  const tg = document.getElementById('themeGrid');
  tg.textContent = '';
  Object.entries(THEMES).forEach(([key, th]) => {
    const card = document.createElement('button'); card.type = 'button';
    card.className = 'theme-card' + (key === st.theme ? ' active' : '');
    const prev = document.createElement('div'); prev.className = 'theme-prev'; prev.style.background = th.bg;
    const bar = document.createElement('div'); bar.className = 'tp-bar'; bar.style.background = th.panel; bar.style.borderRight = '1px solid ' + th.line;
    const p1 = document.createElement('div'); p1.className = 'tp-panel'; p1.style.background = th.lineStrong;
    const p2 = document.createElement('div'); p2.className = 'tp-panel b'; p2.style.background = th.line;
    const dot = document.createElement('div'); dot.className = 'tp-dot'; dot.style.background = th.accent;
    prev.append(bar, p1, p2, dot);
    const name = document.createElement('div'); name.className = 'theme-name'; name.textContent = th.name;
    card.append(prev, name);
    card.addEventListener('click', () => { st.theme = key; st.accent = ''; applySettings(); renderSettings(); scheduleSave(); });
    tg.appendChild(card);
  });

  const sw = document.getElementById('accentSwatches'); sw.textContent = '';
  const eff = (st.accent || t.accent).toLowerCase();
  ACCENTS.forEach(hex => {
    const b = document.createElement('button'); b.type = 'button'; b.title = hex;
    b.className = 'swatch' + (hex.toLowerCase() === eff ? ' active' : '');
    b.style.background = hex;
    b.addEventListener('click', () => { st.accent = hex; applySettings(); renderSettings(); scheduleSave(); });
    sw.appendChild(b);
  });
  document.getElementById('accentColor').value = eff;

  const fg = document.getElementById('fontGrid'); fg.textContent = '';
  FONTS.forEach(f => {
    const c = document.createElement('button'); c.type = 'button';
    c.className = 'font-card' + (f.key === st.font ? ' active' : '');
    c.style.fontFamily = f.stack;
    const lab = document.createElement('span'); lab.textContent = f.label;
    const eg = document.createElement('small'); eg.textContent = 'Aa Bb 123';
    c.append(lab, eg);
    c.addEventListener('click', () => { st.font = f.key; applySettings(); renderSettings(); scheduleSave(); });
    fg.appendChild(c);
  });

  document.getElementById('scaleRange').value = st.scale;
  document.getElementById('scaleVal').textContent = st.scale + '%';
  document.getElementById('radiusRange').value = st.radius;
  document.getElementById('radiusVal').textContent = st.radius + 'px';
  document.getElementById('readingRange').value = st.readingSize;
  document.getElementById('readingVal').textContent = st.readingSize + 'px';
  syncSeg('densityGroup', st.density);
  syncSeg('bgGroup', st.background);
  syncSeg('contactedGroup', st.contacted);
}

// Segmented controls (Luftig/Kompakt, background, contacted-colour).
function syncSeg(id, val) {
  const g = document.getElementById(id); if (!g) return;
  g.querySelectorAll('.seg').forEach(b => b.classList.toggle('on', b.dataset.val === val));
}
function wireSeg(id, key) {
  const g = document.getElementById(id); if (!g) return;
  g.querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => {
    state.settings[key] = b.dataset.val; applySettings(); syncSeg(id, b.dataset.val); scheduleSave();
  }));
}

// Static settings controls — wired once.
function bindSettings() {
  document.getElementById('accentColor').addEventListener('input', (e) => {
    state.settings.accent = e.target.value; applySettings();
    // refresh swatch highlights (cheap)
    document.querySelectorAll('#accentSwatches .swatch').forEach(s => s.classList.toggle('active', s.title.toLowerCase() === e.target.value.toLowerCase()));
    scheduleSave();
  });
  document.getElementById('scaleRange').addEventListener('input', (e) => {
    state.settings.scale = clamp(+e.target.value, 85, 130);
    document.getElementById('scaleVal').textContent = state.settings.scale + '%';
    applySettings(); scheduleSave();
  });
  document.getElementById('radiusRange').addEventListener('input', (e) => {
    state.settings.radius = clamp(+e.target.value, 0, 22);
    document.getElementById('radiusVal').textContent = state.settings.radius + 'px';
    applySettings(); scheduleSave();
  });
  document.getElementById('readingRange').addEventListener('input', (e) => {
    state.settings.readingSize = clamp(+e.target.value, 12, 18);
    document.getElementById('readingVal').textContent = state.settings.readingSize + 'px';
    applySettings(); scheduleSave();
  });
  wireSeg('densityGroup', 'density');
  wireSeg('bgGroup', 'background');
  wireSeg('contactedGroup', 'contacted');
  document.getElementById('resetTheme').addEventListener('click', () => {
    state.settings = { ...defaultSettings(), theme: state.settings.theme };
    applySettings(); renderSettings(); scheduleSave();
  });
}

function renderAll() {
  applySettings();
  renderYear(); renderContactsDatalist(); renderGrid(); renderTasks(); renderReferat();
  renderSettings();
  document.getElementById('summary').value = state.summary;
  setView(state.view || 'oversikt');
}

(async function init() {
  state = normalize(await window.api.load());
  bind();
  renderAll();
})();
