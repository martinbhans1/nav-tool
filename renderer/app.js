// Renderer logic. Local-only state, persisted via window.api (IPC → disk).
// Contacts (initials only) are the shared entity linked across the month grid,
// tasks, and referat reminders. DOM built with textContent (no innerHTML on
// user data) → no injection risk.
//
// Design system: a single icon() helper (inline Lucide SVG, no runtime dep) +
// native-free component factories (button/input/select/combobox/checkbox/radio/
// toggle/segmented/slider/datepicker/menu/modal/tooltip/...). Every form control
// shares --control-h so heights are pixel-identical. The "Designlab" view is the
// component + token gallery.

'use strict';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_FULL = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
const DOW = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']; // week starts Monday
const PRIO_LABEL = { low: 'Lav', normal: 'Normal', high: 'Høy' };
const PRIO_RANK = { high: 0, normal: 1, low: 2 };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  // Defensive: state/settings may not be initialized yet → default to long.
  const fmt = (typeof state === 'object' && state.settings && state.settings.dateFormat) || 'lang';
  if (fmt === 'numerisk') {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }
  // lang = genuinely long: full month name + year, e.g. "18. juni 2026"
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}
const isOverdue = (s) => !!s && s < todayStr();
// Short "for X siden"-style relative timestamp from an epoch ms value.
function relTime(ts) {
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'akkurat nå';
  if (min < 60) return 'for ' + min + ' min siden';
  const hr = Math.floor(min / 60);
  if (hr < 24) return 'for ' + hr + (hr === 1 ? ' time siden' : ' timer siden');
  const day = Math.floor(hr / 24);
  if (day < 7) return 'for ' + day + (day === 1 ? ' dag siden' : ' dager siden');
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
// the new-task date prefilled per the "Standard frist" setting
function defaultDueDate() {
  const d = (typeof state === 'object' && state.settings && state.settings.defaultDue) || 'today';
  if (d === 'tomorrow') return addDays(todayStr(), 1);
  if (d === 'none') return '';
  return todayStr();
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// add n days to a 'YYYY-MM-DD' string (or to today if empty) → 'YYYY-MM-DD'
function addDays(s, n) {
  const d = s ? new Date(s + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================================
// ICONS — inline Lucide SVG, stroke-width 1.75, sized by the --icon token.
// Only the handful we actually use. Path data copied from lucide.dev (ISC).
// =====================================================================
const LUCIDE = {
  'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  'check-square': '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'pen-line': '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  'notebook': '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>',
  'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'palette': '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  'calendar-plus': '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  'folder': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
};
function icon(name) {
  const p = LUCIDE[name];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p || ''}</svg>`;
}
// fill any [data-icon] placeholders in static markup with the .ic wrapper SVG.
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconDone) return;
    el.classList.add('ic');
    el.innerHTML = icon(el.dataset.icon);
    el.dataset.iconDone = '1';
  });
}

// small DOM helper
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// ---------- theming data ----------
const SHADOW_LIGHT = '0 1px 2px rgba(20,28,45,.04), 0 6px 20px rgba(20,28,45,.06)';
const SHADOW_DARK = '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.32)';
// Heading-font stacks (system, offline). Themes pick one as their "vibe".
const HEAD_SANS  = 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
// elegant, "that-girl" editorial serif — humanist/calligraphic Windows faces
// first (Palatino, Constantia), Georgia/Times as universal fallbacks.
const HEAD_SERIF = '"Palatino Linotype", Palatino, "Book Antiqua", Constantia, Georgia, "Times New Roman", serif';
//
// Each theme is a *vibe bundle*: colours + a heading font (`head`), a default
// body font key (`font`), a default radius and a default accent. Picking a theme
// applies all of these; the customization controls (accent / font / size /
// radius) can still override afterward. `lift` tunes the elevation ladder —
// dark themes lift harder so the "emerging from dark" steps are unmistakable,
// light themes lift gently so the ladder stays subtle.
const THEMES = {
  lys:      { name: 'Lys',      bg: '#eceef2', panel: '#ffffff', ink: '#1b2230', muted: '#6b7480', faint: '#9aa3af', line: '#e6e8ec', lineStrong: '#d8dbe1', accent: '#4f46e5', shadow: SHADOW_LIGHT, head: HEAD_SANS,  font: 'system', radius: 12, lift: 4.5 },
  rosa:     { name: 'Rosa',     bg: '#f7e4ec', panel: '#fffafc', ink: '#3b2530', muted: '#8a6b76', faint: '#bd9aa6', line: '#f4e2e9', lineStrong: '#ecd2dd', accent: '#db2777', shadow: '0 1px 2px rgba(80,20,45,.05), 0 6px 20px rgba(120,30,70,.08)', head: HEAD_SANS, font: 'system', radius: 14, lift: 4.5 },
  lavendel: { name: 'Lavendel', bg: '#ece6fa', panel: '#fffdff', ink: '#2c2440', muted: '#756b8a', faint: '#a99fc0', line: '#e9e3f6', lineStrong: '#ddd4ef', accent: '#7c3aed', shadow: SHADOW_LIGHT, head: HEAD_SANS,  font: 'system', radius: 13, lift: 4.5 },
  sand:     { name: 'Sand',     bg: '#efe8da', panel: '#fffdf8', ink: '#2f2a22', muted: '#7d7361', faint: '#b3a995', line: '#ece5d8', lineStrong: '#e0d7c4', accent: '#b4530a', shadow: SHADOW_LIGHT, head: HEAD_SANS,  font: 'system', radius: 12, lift: 4.5 },
  mynte:    { name: 'Mynte',    bg: '#e0f0e7', panel: '#fbfffd', ink: '#1c2a26', muted: '#5f7a70', faint: '#9bb5aa', line: '#dcebe4', lineStrong: '#cce0d6', accent: '#0d9488', shadow: SHADOW_LIGHT, head: HEAD_SANS,  font: 'system', radius: 12, lift: 4.5 },
  fersken:  { name: 'Fersken',  bg: '#f9e6da', panel: '#fffbf8', ink: '#3a2820', muted: '#8a6f60', faint: '#c2a795', line: '#f5e3d8', lineStrong: '#eed5c6', accent: '#e0603a', shadow: SHADOW_LIGHT, head: HEAD_SANS,  font: 'system', radius: 14, lift: 4.5 },
  estetisk: { name: 'Estetisk', bg: '#e7e1d4', panel: '#fefdfb', ink: '#403930', muted: '#8a7d6c', faint: '#b3a692', line: '#e2d9c8', lineStrong: '#d0c4ad', accent: '#9d7a54', shadow: '0 1px 2px rgba(74,64,56,.05), 0 10px 30px rgba(120,100,80,.12)', head: HEAD_SERIF, font: 'system', radius: 18, lift: 5 },
  kontrast: { name: 'Kontrast', bg: '#ffffff', panel: '#ffffff', ink: '#000000', muted: '#2b2b2b', faint: '#555555', line: '#161616', lineStrong: '#000000', accent: '#1d4ed8', shadow: 'none', head: HEAD_SANS, font: 'system', radius: 8, lift: 4 },
  mork:     { name: 'Mørk',     bg: '#14161b', panel: '#1c1f26', ink: '#e7eaf0', muted: '#9aa3b2', faint: '#6b7280', line: '#2a2e37', lineStrong: '#363b46', accent: '#818cf8', shadow: SHADOW_DARK, head: HEAD_SANS, font: 'system', radius: 12, lift: 7 },
  grafitt:  { name: 'Grafitt',  bg: '#1a1c1f', panel: '#232629', ink: '#e8eaed', muted: '#9aa0a8', faint: '#6a7078', line: '#2f3338', lineStrong: '#3b4046', accent: '#7aa2c9', shadow: SHADOW_DARK, head: HEAD_SANS, font: 'system', radius: 10, lift: 7 },
  hav:      { name: 'Hav',      bg: '#0f1720', panel: '#16212c', ink: '#e2ecf2', muted: '#8aa0b0', faint: '#5f7180', line: '#22323f', lineStrong: '#2e4150', accent: '#2dd4bf', shadow: SHADOW_DARK, head: HEAD_SANS, font: 'system', radius: 12, lift: 7.5 },
};
// Themes whose accent is light enough to need dark text on filled controls.
const DARK_ON_ACCENT = new Set(['hav']);
const FONTS = [
  { key: 'system',  label: 'System',   stack: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif' },
  { key: 'rounded', label: 'Avrundet', stack: 'ui-rounded, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif' },
  { key: 'serif',   label: 'Serif',    stack: '"Palatino Linotype", Palatino, "Book Antiqua", Constantia, Georgia, serif' },
  { key: 'verdana', label: 'Verdana',  stack: 'Verdana, Geneva, Tahoma, sans-serif' },
  { key: 'mono',    label: 'Mono',     stack: '"Cascadia Code", Consolas, "Courier New", ui-monospace, monospace' },
];
const ACCENTS = ['#4f46e5', '#db2777', '#7c3aed', '#2563eb', '#0ea5a4', '#16a34a', '#d97706', '#e11d48', '#0891b2', '#475569'];
// Button styles — the live, app-wide primary-button "vibe". Keys live in CSS
// (`[data-btn-style="<key>"] .btn.primary`); labels are Norwegian for the UI.
// All token-driven (derived from --accent and friends); each defines hover/active.
const BTN_STYLES = [
  { key: 'solid',    label: 'Standard',  desc: 'Fylt aksent — appens grunnlook.' },
  { key: 'lift',     label: 'Løft',      desc: 'Hever seg ved peking.' },
  { key: 'sharp',    label: 'Skarp',     desc: 'Helt rette hjørner.' },
  { key: 'pill',     label: 'Pille',     desc: 'Helt avrundet.' },
  { key: 'soft',     label: 'Myk',       desc: 'Dempet aksent-tone.' },
  { key: 'outline',  label: 'Omriss',    desc: 'Kantlinje, fylles ved peking.' },
  { key: 'gradient', label: 'Gradient',  desc: 'Glidende aksent-overgang.' },
  { key: 'glow',     label: 'Glød',      desc: 'Mykt aksent-skjær.' },
];
const BTN_STYLE_KEYS = BTN_STYLES.map(s => s.key);

// Field styles — the live, app-wide form-field "vibe". Keys live in CSS
// (`[data-field-style="<key>"] .field` + the input-like surfaces); labels
// are Norwegian. All token-driven; each defines its own focus state.
const FIELD_STYLES = [
  { key: 'standard',   label: 'Standard',  desc: 'Kantet boks — appens grunnlook.' },
  { key: 'myk',        label: 'Myk',       desc: 'Fylt flate, svak kant.' },
  { key: 'understrek', label: 'Understrek', desc: 'Kun strek under, ingen boks.' },
  { key: 'skarp',      label: 'Skarp',     desc: 'Helt rette hjørner.' },
  { key: 'pille',      label: 'Pille',     desc: 'Helt avrundet.' },
];
const FIELD_STYLE_KEYS = FIELD_STYLES.map(s => s.key);

// Dropdown styles — the live, app-wide "vibe" for the floating menu (.pop) used
// by dropdown / combobox / menu. Keys live in CSS (`[data-dd-style="<key>"] .pop`).
const DD_STYLES = [
  { key: 'standard', label: 'Standard', desc: 'Klar overflate — appens grunnlook.' },
  { key: 'myk',      label: 'Myk',      desc: 'Mykere flate, større runding.' },
  { key: 'kompakt',  label: 'Kompakt',  desc: 'Tettere rader.' },
  { key: 'kant',     label: 'Omriss',   desc: 'Tydelig kant, flatere.' },
];
const DD_STYLE_KEYS = DD_STYLES.map(s => s.key);

const LANDING_VIEWS = ['hjem', 'oversikt', 'tasks', 'referat', 'kalender'];
const MOTION_VALUES = ['full', 'redusert', 'av'];
const HEADING_FONTS = ['auto', 'sans', 'serif'];
const DATE_FORMATS = ['lang', 'numerisk'];
const DEFAULT_DUE_VALUES = ['today', 'tomorrow', 'none'];

function defaultSettings() {
  return { theme: 'lys', accent: '', fieldColor: '', font: 'system', scale: 100, radius: 12,
           density: 'comfortable', readingSize: 14, background: 'flat', contacted: 'green',
           btnStyle: 'solid', fieldStyle: 'standard', ddStyle: 'standard',
           // appearance (new)
           gradientStrength: 6, motion: 'full', headingFont: 'auto',
           // behavioral (new)
           landingView: 'hjem', defaultPriority: 'normal', defaultDue: 'today', dateFormat: 'lang' };
}

function defaultState() {
  return {
    version: 2,
    view: 'hjem',
    year: new Date().getFullYear(),
    contacts: [],          // [{ id, initials }]
    contacted: {},         // { contactId: { [year]: [bool x12] } }
    tasks: [],             // [{ id, title, note, due, priority, contactId, done, createdAt, doneAt }]
    referater: [],         // [{ id, title, note, date, contactId, done, createdAt, doneAt }]
    notes: [],             // [{ id, text, createdAt }] — quick-capture notes from Hjem
    summary: '',
    customThemes: [],      // [{ key:'egen-<id>', name, custom:true, ...full palette }] — user-made vibe bundles
    settings: defaultSettings(),
  };
}

// Validate a single user-made theme into a complete, safe vibe bundle (same
// shape as a built-in THEMES entry, plus key/name/custom). Returns null if junk.
const HEX6 = /^#[0-9a-fA-F]{6}$/;
function sanitizeCustomTheme(t) {
  if (!t || typeof t !== 'object') return null;
  const key = typeof t.key === 'string' && t.key ? t.key : null;
  if (!key || THEMES[key]) return null;                 // need a key that can't shadow a built-in
  const hex = (v, fb) => (HEX6.test(v || '') ? v.toLowerCase() : fb);
  const bg = hex(t.bg, '#f5f6f8');
  return {
    key,
    name: String(t.name || 'Eget tema').slice(0, 40) || 'Eget tema',
    custom: true,
    bg,
    panel: hex(t.panel, '#ffffff'),
    ink: hex(t.ink, '#1b2230'),
    muted: hex(t.muted, '#6b7480'),
    faint: hex(t.faint, '#9aa3af'),
    line: hex(t.line, '#e6e8ec'),
    lineStrong: hex(t.lineStrong, '#d8dbe1'),
    accent: hex(t.accent, '#4f46e5'),
    shadow: typeof t.shadow === 'string' && t.shadow ? t.shadow : SHADOW_LIGHT,
    head: t.head === HEAD_SERIF ? HEAD_SERIF : HEAD_SANS,
    font: t.font === 'serif' ? 'serif' : 'system',
    radius: Number.isFinite(t.radius) ? clamp(t.radius, 0, 22) : 12,
    lift: Number.isFinite(t.lift) ? clamp(t.lift, 0, 14) : 4.5,
  };
}

// Merge built-ins with the user's custom themes for any theme lookup / listing.
// Built-ins always win on key collision (sanitizeCustomTheme already rejects
// keys that shadow a built-in, so this is just belt-and-suspenders).
function allThemes() {
  const out = { ...THEMES };
  for (const t of (state.customThemes || [])) out[t.key] = t;
  return out;
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
    view: typeof s.view === 'string' ? s.view : 'hjem',
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
    notes: (Array.isArray(s.notes) ? s.notes : []).filter(n => n && typeof n === 'object').map(n => ({
      id: typeof n.id === 'string' && n.id ? n.id : uid(),
      text: String(n.text != null ? n.text : '').slice(0, 2000),
      createdAt: Number.isFinite(n.createdAt) ? n.createdAt : Date.now(),
    })).filter(n => n.text.trim()),
    summary: typeof s.summary === 'string' ? s.summary : '',
    customThemes: (() => {
      const arr = Array.isArray(s.customThemes) ? s.customThemes : [];
      const seen = new Set();
      const out = [];
      for (const raw of arr) {
        const t = sanitizeCustomTheme(raw);
        if (t && !seen.has(t.key)) { seen.add(t.key); out.push(t); }
      }
      return out;
    })(),
    settings: (() => {
      const si = (s.settings && typeof s.settings === 'object') ? s.settings : {};
      const def = defaultSettings();
      // valid themes = built-ins + the custom themes we just sanitized above
      const customKeys = Array.isArray(s.customThemes)
        ? new Set(s.customThemes.map(sanitizeCustomTheme).filter(Boolean).map(t => t.key)) : new Set();
      const themeOk = (k) => !!THEMES[k] || customKeys.has(k);
      return {
        theme: themeOk(si.theme) ? si.theme : def.theme,
        accent: /^#[0-9a-fA-F]{6}$/.test(si.accent || '') ? si.accent : '',
        fieldColor: /^#[0-9a-fA-F]{6}$/.test(si.fieldColor || '') ? si.fieldColor : '',
        font: FONTS.some(f => f.key === si.font) ? si.font : def.font,
        scale: Number.isFinite(si.scale) ? clamp(si.scale, 85, 130) : def.scale,
        radius: Number.isFinite(si.radius) ? clamp(si.radius, 0, 22) : def.radius,
        density: ['comfortable', 'compact'].includes(si.density) ? si.density : def.density,
        readingSize: Number.isFinite(si.readingSize) ? clamp(si.readingSize, 12, 18) : def.readingSize,
        background: ['flat', 'gradient', 'dots'].includes(si.background) ? si.background : def.background,
        contacted: ['green', 'accent'].includes(si.contacted) ? si.contacted : def.contacted,
        btnStyle: BTN_STYLE_KEYS.includes(si.btnStyle) ? si.btnStyle : def.btnStyle,
        fieldStyle: FIELD_STYLE_KEYS.includes(si.fieldStyle) ? si.fieldStyle : def.fieldStyle,
        ddStyle: DD_STYLE_KEYS.includes(si.ddStyle) ? si.ddStyle : def.ddStyle,
        gradientStrength: Number.isFinite(si.gradientStrength) ? clamp(si.gradientStrength, 0, 14) : def.gradientStrength,
        motion: MOTION_VALUES.includes(si.motion) ? si.motion : def.motion,
        headingFont: HEADING_FONTS.includes(si.headingFont) ? si.headingFont : def.headingFont,
        landingView: LANDING_VIEWS.includes(si.landingView) ? si.landingView : def.landingView,
        defaultPriority: ['low', 'normal', 'high'].includes(si.defaultPriority) ? si.defaultPriority : def.defaultPriority,
        defaultDue: DEFAULT_DUE_VALUES.includes(si.defaultDue) ? si.defaultDue : def.defaultDue,
        dateFormat: DATE_FORMATS.includes(si.dateFormat) ? si.dateFormat : def.dateFormat,
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
    renderGrid();
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
  confirmModal({
    title: 'Fjerne ' + c.initials + '?',
    body: 'Kontakt-historikk slettes, og koblinger i gjøremål/referat fjernes.',
    confirmLabel: 'Fjern', danger: true,
    onConfirm: () => {
      state.contacts = state.contacts.filter(x => x.id !== id);
      delete state.contacted[id];
      state.tasks.forEach(t => { if (t.contactId === id) t.contactId = null; });
      state.referater.forEach(r => { if (r.contactId === id) r.contactId = null; });
      renderGrid(); renderTasks(); renderReferat();
      scheduleSave();
    },
  });
}

// =====================================================================
// COMPONENT FACTORIES — native-free, all sharing the sizing tokens.
// =====================================================================

// --- button: returns a <button>. opts: {label, variant, icon, onClick, sm,
//     disabled, type, block, title} ---
function button({ label = '', variant = 'secondary', icon: ic, onClick, sm = false,
                  disabled = false, type = 'button', block = false, title } = {}) {
  const b = document.createElement('button');
  b.type = type;
  b.className = 'btn ' + variant + (sm ? ' sm' : '') + (block ? ' block' : '');
  if (ic) { const s = el('span', 'ic'); s.innerHTML = icon(ic); b.appendChild(s); }
  if (label) b.appendChild(el('span', null, label));
  if (disabled) b.disabled = true;
  if (title) b.dataset.tip = title;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// --- searchable combobox (contacts). Type initials, pick or keep what's typed.
function buildCombo(host, { placeholder = 'Initialer', getItems }) {
  host.classList.add('combo'); host.textContent = '';
  const input = document.createElement('input');
  input.className = 'field combo-input uppercase'; input.type = 'text'; input.maxLength = 6;
  input.placeholder = placeholder; input.autocomplete = 'off';
  const pop = el('div', 'pop hidden');
  host.append(input, pop);
  let filtered = [], active = -1;
  const close = () => { pop.classList.add('hidden'); active = -1; };
  const open = () => {
    const q = input.value.trim().toUpperCase();
    filtered = getItems().filter(i => !q || i.label.toUpperCase().includes(q));
    pop.textContent = '';
    if (!filtered.length) {
      const e = el('div', 'pop-empty', q ? ('Opprett ny: ' + q) : 'Ingen kontakter ennå — skriv initialer');
      if (q) e.classList.add('pop-create');
      pop.appendChild(e);
    } else {
      filtered.forEach((it, i) => {
        const item = el('div', 'pop-item' + (i === active ? ' active' : ''));
        item.append(el('span', 'dot'), el('span', null, it.label));
        item.addEventListener('mousedown', (ev) => { ev.preventDefault(); input.value = it.label; close(); });
        pop.appendChild(item);
      });
    }
    pop.classList.remove('hidden');
  };
  input.addEventListener('focus', open);
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); active = -1; open(); });
  input.addEventListener('keydown', (e) => {
    if (pop.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(filtered.length - 1, active + 1); open(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); open(); }
    else if (e.key === 'Enter' && active >= 0 && filtered[active]) { e.preventDefault(); input.value = filtered[active].label; close(); }
    else if (e.key === 'Escape') { close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 130));
  return { get value() { return input.value.trim(); }, set value(v) { input.value = (v || '').toUpperCase(); }, clear() { input.value = ''; }, el: host };
}

// --- fixed-option dropdown (custom select). opts: {value, items:[{value,label}],
//     placeholder, onChange} ---
function buildDropdown(host, { value, items, placeholder = 'Velg…', onChange } = {}) {
  host.classList.add('ddc'); host.textContent = '';
  const trigger = el('button', 'dd-trigger'); trigger.type = 'button';
  const lab = el('span', 'dd-val');
  const caret = el('span', 'dd-caret'); caret.innerHTML = icon('chevron-down');
  trigger.append(lab, caret);
  const pop = el('div', 'pop hidden');
  host.append(trigger, pop);
  let cur = value;
  const setLab = () => {
    const it = items.find(i => i.value === cur);
    lab.textContent = it ? it.label : placeholder;
    trigger.classList.toggle('placeholder', !it);
  };
  const close = () => { pop.classList.add('hidden'); host.classList.remove('open'); };
  const open = () => {
    pop.textContent = '';
    items.forEach(it => {
      const item = el('div', 'pop-item' + (it.value === cur ? ' selected' : ''));
      item.append(el('span', null, it.label));
      const ck = el('span', 'pop-check'); ck.innerHTML = icon('check'); item.appendChild(ck);
      item.addEventListener('mousedown', (ev) => { ev.preventDefault(); cur = it.value; setLab(); close(); if (onChange) onChange(cur); });
      pop.appendChild(item);
    });
    pop.classList.remove('hidden'); host.classList.add('open');
  };
  trigger.addEventListener('click', () => pop.classList.contains('hidden') ? open() : close());
  trigger.addEventListener('blur', () => setTimeout(close, 130));
  setLab();
  return { get value() { return cur; }, set value(v) { cur = v; setLab(); }, el: host };
}

// --- checkbox: span[role=checkbox]. opts: {checked, label, onChange, disabled} ---
function buildCheckbox({ checked = false, label = '', onChange, disabled = false } = {}) {
  const wrap = el('span', 'checkbox' + (checked ? ' on' : '') + (disabled ? ' disabled' : ''));
  wrap.tabIndex = disabled ? -1 : 0; wrap.setAttribute('role', 'checkbox'); wrap.setAttribute('aria-checked', String(checked));
  const box = el('span', 'box'); box.innerHTML = icon('check');
  wrap.appendChild(box);
  if (label) wrap.appendChild(el('span', 'cb-label', label));
  let on = checked;
  const set = (v) => { on = v; wrap.classList.toggle('on', on); wrap.setAttribute('aria-checked', String(on)); };
  const toggle = () => { if (disabled) return; set(!on); if (onChange) onChange(on); };
  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
  return { el: wrap, get checked() { return on; }, set checked(v) { set(v); } };
}

// --- radio group: opts: {value, items:[{value,label}], onChange, name} ---
function buildRadioGroup({ value, items, onChange } = {}) {
  const wrap = el('div', 'lab-row');
  let cur = value;
  const radios = [];
  items.forEach(it => {
    const r = el('span', 'radio' + (it.value === cur ? ' on' : ''));
    r.tabIndex = 0; r.setAttribute('role', 'radio'); r.setAttribute('aria-checked', String(it.value === cur));
    r.append(el('span', 'dot-ring'), el('span', null, it.label));
    const pick = () => { cur = it.value; radios.forEach(x => { x.r.classList.toggle('on', x.v === cur); x.r.setAttribute('aria-checked', String(x.v === cur)); }); if (onChange) onChange(cur); };
    r.addEventListener('click', pick);
    r.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick(); } });
    radios.push({ r, v: it.value }); wrap.appendChild(r);
  });
  return { el: wrap, get value() { return cur; } };
}

// --- toggle switch: opts: {checked, label, onChange} ---
function buildToggle({ checked = false, label = '', onChange } = {}) {
  const wrap = el('span', 'toggle' + (checked ? ' on' : ''));
  wrap.tabIndex = 0; wrap.setAttribute('role', 'switch'); wrap.setAttribute('aria-checked', String(checked));
  wrap.appendChild(el('span', 'track'));
  if (label) wrap.appendChild(el('span', null, label));
  let on = checked;
  const toggle = () => { on = !on; wrap.classList.toggle('on', on); wrap.setAttribute('aria-checked', String(on)); if (onChange) onChange(on); };
  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
  return { el: wrap, get checked() { return on; } };
}

// --- segmented control: opts: {value, items:[{value,label}], onChange} ---
function buildSegmented({ value, items, onChange } = {}) {
  const g = el('div', 'seg-group');
  let cur = value;
  const segs = [];
  items.forEach(it => {
    const b = el('button', 'seg' + (it.value === cur ? ' on' : '')); b.type = 'button'; b.textContent = it.label;
    b.addEventListener('click', () => { cur = it.value; segs.forEach(s => s.b.classList.toggle('on', s.v === cur)); if (onChange) onChange(cur); });
    segs.push({ b, v: it.value }); g.appendChild(b);
  });
  return { el: g, get value() { return cur; }, set value(v) { cur = v; segs.forEach(s => s.b.classList.toggle('on', s.v === cur)); } };
}

// --- slider: opts: {min, max, step, value, onInput, format} → accent-fill track.
function buildSlider({ min = 0, max = 100, step = 1, value = 50, onInput, onChange, disabled = false } = {}) {
  const wrap = el('div', 'slider' + (disabled ? ' disabled' : ''));
  wrap.tabIndex = disabled ? -1 : 0; wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-valuemin', String(min)); wrap.setAttribute('aria-valuemax', String(max));
  const track = el('div', 'slider-track');
  const fill = el('div', 'slider-fill');
  const thumb = el('div', 'slider-thumb');
  track.append(fill, thumb); wrap.appendChild(track);
  let val = clamp(value, min, max);
  const paint = () => {
    const pct = (val - min) / (max - min) * 100;
    fill.style.width = pct + '%';
    thumb.style.left = pct + '%';
    wrap.setAttribute('aria-valuenow', String(val));
  };
  const setFromClientX = (clientX) => {
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    let v = min + ratio * (max - min);
    v = Math.round(v / step) * step;
    v = clamp(v, min, max);
    if (v !== val) { val = v; paint(); if (onInput) onInput(val); } else { paint(); }
  };
  let dragging = false;
  const onMove = (e) => { if (dragging) setFromClientX(e.clientX); };
  const onUp = () => { dragging = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (onChange) onChange(val); };
  wrap.addEventListener('pointerdown', (e) => { if (disabled) return; dragging = true; setFromClientX(e.clientX); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); });
  wrap.addEventListener('keydown', (e) => {
    if (disabled) return;
    let v = val;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
    else if (e.key === 'Home') v = min;
    else if (e.key === 'End') v = max;
    else return;
    e.preventDefault(); v = clamp(v, min, max); if (v !== val) { val = v; paint(); if (onInput) onInput(val); }
  });
  wrap.addEventListener('keyup', () => { if (!disabled && onChange) onChange(val); });
  paint();
  return { el: wrap, get value() { return val; }, set value(v) { val = clamp(v, min, max); paint(); } };
}

// --- custom DATE PICKER (replaces <input type=date>). Value is 'YYYY-MM-DD' or ''.
function buildDatePicker(host, { value = '', placeholder = 'Velg dato', onChange } = {}) {
  host.classList.add('datepicker'); host.textContent = '';
  const trigger = el('button', 'dp-trigger'); trigger.type = 'button';
  const ic = el('span', 'dp-ic'); ic.innerHTML = icon('calendar');
  const valEl = el('span', 'dp-val');
  trigger.append(ic, valEl);
  const cal = el('div', 'dp-cal hidden');
  host.append(trigger, cal);

  let cur = value;                      // selected 'YYYY-MM-DD'
  let viewY, viewM;                     // calendar's visible month
  const initView = () => {
    const base = cur ? new Date(cur + 'T00:00:00') : new Date();
    viewY = base.getFullYear(); viewM = base.getMonth();
  };
  const setLabel = () => {
    if (cur) { valEl.textContent = fmtDate(cur); trigger.classList.add('has-value'); trigger.classList.remove('placeholder'); }
    else { valEl.textContent = placeholder; trigger.classList.remove('has-value'); trigger.classList.add('placeholder'); }
  };
  const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const close = () => cal.classList.add('hidden');
  const open = () => { initView(); renderCal(); cal.classList.remove('hidden'); };

  function renderCal() {
    cal.textContent = '';
    const head = el('div', 'dp-head');
    const title = el('div', 'dp-title', MONTHS_FULL[viewM] + ' ' + viewY);
    const nav = el('div', 'dp-nav');
    const prev = el('button', null); prev.type = 'button'; prev.innerHTML = icon('chevron-left'); prev.setAttribute('aria-label', 'Forrige måned');
    const next = el('button', null); next.type = 'button'; next.innerHTML = icon('chevron-right'); next.setAttribute('aria-label', 'Neste måned');
    prev.addEventListener('click', (e) => { e.stopPropagation(); viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCal(); });
    next.addEventListener('click', (e) => { e.stopPropagation(); viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCal(); });
    nav.append(prev, next); head.append(title, nav); cal.appendChild(head);

    const dow = el('div', 'dp-dow');
    DOW.forEach(d => dow.appendChild(el('span', null, d)));
    cal.appendChild(dow);

    const grid = el('div', 'dp-grid');
    const first = new Date(viewY, viewM, 1);
    let lead = (first.getDay() + 6) % 7; // make Monday=0
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const prevDays = new Date(viewY, viewM, 0).getDate();
    const today = todayStr();
    // leading days from previous month
    for (let i = lead - 1; i >= 0; i--) {
      const d = prevDays - i;
      const b = el('button', 'dp-day muted'); b.type = 'button'; b.textContent = String(d);
      b.addEventListener('click', (e) => { e.stopPropagation(); viewM--; if (viewM < 0) { viewM = 11; viewY--; } pick(ymd(viewY, viewM, d)); });
      grid.appendChild(b);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = ymd(viewY, viewM, d);
      const b = el('button', 'dp-day' + (ds === cur ? ' selected' : '') + (ds === today ? ' today' : '')); b.type = 'button'; b.textContent = String(d);
      b.addEventListener('click', (e) => { e.stopPropagation(); pick(ds); });
      grid.appendChild(b);
    }
    const total = lead + daysInMonth;
    const trail = (7 - (total % 7)) % 7;
    for (let d = 1; d <= trail; d++) {
      const b = el('button', 'dp-day muted'); b.type = 'button'; b.textContent = String(d);
      b.addEventListener('click', (e) => { e.stopPropagation(); viewM++; if (viewM > 11) { viewM = 0; viewY++; } pick(ymd(viewY, viewM, d)); });
      grid.appendChild(b);
    }
    cal.appendChild(grid);

    const foot = el('div', 'dp-foot');
    const todayBtn = el('button', null, 'I dag'); todayBtn.type = 'button';
    todayBtn.addEventListener('click', (e) => { e.stopPropagation(); pick(today); });
    const clearBtn = el('button', 'dp-clearbtn', 'Fjern'); clearBtn.type = 'button';
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); pick(''); });
    foot.append(todayBtn, clearBtn); cal.appendChild(foot);
  }

  function pick(v) { cur = v; setLabel(); close(); if (onChange) onChange(cur); }

  trigger.addEventListener('click', () => {
    cal.classList.contains('hidden') ? open() : close();
  });
  // outside click closes
  document.addEventListener('mousedown', (e) => { if (!host.contains(e.target)) close(); });
  setLabel();
  return { el: host, get value() { return cur; }, set value(v) { cur = v || ''; setLabel(); }, clear() { cur = ''; setLabel(); } };
}

// --- colour well (replaces native <input type=color>) — opens a hidden native
//     picker is NOT allowed; we build a small swatch grid + free-pick via a
//     lightweight hex prompt modal. Keeps it native-free.
function buildColorWell(host, { value = '#4f46e5', tip = 'Velg aksentfarge', onLive, onDefault, onClose } = {}) {
  // renderSettings() rebuilds this well on every settings change, but the host
  // (#accentColor) is a persistent element — re-adding listeners each time would
  // stack them, so a single click would open one picker modal per past render.
  // Replace the node with a shallow clone to drop any previously-bound handlers.
  if (host.parentNode) { const fresh = host.cloneNode(false); host.parentNode.replaceChild(fresh, host); host = fresh; }
  host.classList.add('color-well'); host.textContent = '';
  host.setAttribute('role', 'button'); host.tabIndex = 0; host.dataset.tip = tip;
  const sw = el('span', 'cw-swatch'); host.appendChild(sw);
  let cur = value;
  const paint = () => { sw.style.background = cur; };
  const openPicker = () => {
    colorPickerModal({
      startHex: cur,
      onLive: (hex) => { cur = hex; paint(); if (onLive) onLive(hex); },
      onDefault,
      onClose,
    });
  };
  host.addEventListener('click', openPicker);
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  paint();
  return { el: host, get value() { return cur; }, set value(v) { cur = v; paint(); } };
}

// --- modal / dialog ---
const modalMount = document.getElementById('modalMount');
function openModal({ title, bodyNode, footNode, width }) {
  const overlay = el('div', 'modal-overlay');
  const modal = el('div', 'modal');
  if (width) modal.style.width = width + 'px';
  const body = el('div', 'modal-body'); if (bodyNode) body.appendChild(bodyNode);
  // Only render the header bar when there's an actual title — a titleless modal
  // (e.g. the contact-detail view, which carries its own header) gets no empty bar.
  if (title) {
    const head = el('div', 'modal-head'); head.appendChild(el('div', 'modal-title', title));
    modal.append(head, body);
  } else {
    body.classList.add('modal-body--notitle');
    modal.append(body);
  }
  if (footNode) { const foot = el('div', 'modal-foot'); foot.appendChild(footNode); modal.appendChild(foot); }
  overlay.appendChild(modal);
  const close = () => overlay.remove();
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  modalMount.appendChild(overlay);
  return { overlay, close };
}
function confirmModal({ title, body, confirmLabel = 'OK', cancelLabel = 'Avbryt', danger = false, onConfirm }) {
  const bodyNode = el('div', null, body);
  const foot = el('div', 'lab-row');
  const cancel = button({ label: cancelLabel, variant: 'ghost' });
  const ok = button({ label: confirmLabel, variant: danger ? 'danger' : 'primary' });
  foot.append(cancel, ok);
  const m = openModal({ title, bodyNode, footNode: foot });
  cancel.addEventListener('click', m.close);
  ok.addEventListener('click', () => { m.close(); if (onConfirm) onConfirm(); });
}
// --- colour maths (hex ⇄ rgb ⇄ hsv) for the interactive picker ---
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { const h = (x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0'); return '#' + h(r) + h(g) + h(b); }
// relative luminance 0..1 (perceptual-ish) — used to detect light vs dark bg
function hexLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
// linear mix: t=0 → a, t=1 → b. Returns a hex string.
function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  t = clamp(t, 0, 1);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}
function hsvToHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
// shared pointer-drag helper (also used by the picker's SV area + hue bar)
function dragify(node, onMove) {
  const move = (e) => { e.preventDefault(); onMove(e); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  node.addEventListener('pointerdown', (e) => { onMove(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); });
}

// Interactive accent picker: saturation/value square + hue bar + hex + presets,
// with LIVE preview as you drag. onLive(hex) fires continuously; onDefault resets
// to the theme default; onClose commits (re-render + save). Native-free, offline.
function colorPickerModal({ startHex = '#4f46e5', onLive, onDefault, onClose }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(startHex) ? startHex : '#4f46e5';
  let [h, s, v] = rgbToHsv(...hexToRgb(safe));

  const body = el('div', 'cp');
  const area = el('div', 'cp-area'); const areaThumb = el('div', 'cp-thumb'); area.appendChild(areaThumb);
  const hue = el('div', 'cp-hue'); const hueThumb = el('div', 'cp-thumb cp-hue-thumb'); hue.appendChild(hueThumb);
  const row = el('div', 'cp-row');
  const preview = el('div', 'cp-preview');
  const hexInput = document.createElement('input');
  hexInput.className = 'field'; hexInput.maxLength = 7; hexInput.spellcheck = false; hexInput.setAttribute('aria-label', 'Hex-kode');
  row.append(preview, hexInput);
  const presets = el('div', 'swatches cp-presets');
  ACCENTS.forEach(hex => { const b = el('button', 'swatch'); b.type = 'button'; b.style.background = hex; b.dataset.tip = hex; b.addEventListener('click', () => { [h, s, v] = rgbToHsv(...hexToRgb(hex)); live(); }); presets.appendChild(b); });
  body.append(area, hue, row, presets);

  const render = () => {
    area.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h} 100% 50%)`;
    areaThumb.style.left = (s * 100) + '%'; areaThumb.style.top = ((1 - v) * 100) + '%';
    hueThumb.style.left = (h / 360 * 100) + '%';
    const hex = hsvToHex(h, s, v);
    preview.style.background = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex;
  };
  const live = () => { render(); if (onLive) onLive(hsvToHex(h, s, v)); };

  dragify(area, (e) => { const r = area.getBoundingClientRect(); s = clamp((e.clientX - r.left) / r.width, 0, 1); v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); live(); });
  dragify(hue, (e) => { const r = hue.getBoundingClientRect(); h = clamp((e.clientX - r.left) / r.width, 0, 1) * 359.99; live(); });
  hexInput.addEventListener('input', () => { const val = hexInput.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(val)) { [h, s, v] = rgbToHsv(...hexToRgb(val)); render(); if (onLive) onLive(val); } });

  const foot = el('div', 'lab-row');
  const def = button({ label: 'Standard', variant: 'ghost' });
  const done = button({ label: 'Ferdig', variant: 'primary' });
  foot.append(def, done);
  const m = openModal({ title: 'Aksentfarge', bodyNode: body, footNode: foot, width: 312 });
  def.addEventListener('click', () => { m.close(); if (onDefault) onDefault(); if (onClose) onClose(); });
  done.addEventListener('click', () => { m.close(); if (onClose) onClose(); });
  render();
}

// --- dropdown menu (popover with action items) ---
function buildMenu(anchorBtn, items) {
  const pop = el('div', 'pop menu'); pop.style.minWidth = '180px';
  items.forEach(it => {
    if (it.sep) { pop.appendChild(el('div', 'menu-sep')); return; }
    const b = el('button', 'menu-item' + (it.danger ? ' danger' : '')); b.type = 'button';
    if (it.icon) { const s = el('span', 'ic'); s.innerHTML = icon(it.icon); b.appendChild(s); }
    b.appendChild(el('span', null, it.label));
    b.addEventListener('click', () => { close(); if (it.onClick) it.onClick(); });
    pop.appendChild(b);
  });
  const host = anchorBtn.parentElement;
  host.style.position = host.style.position || 'relative';
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchorBtn) close(); };
  host.appendChild(pop);
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  return { close };
}

// custom tooltip is CSS-only via [data-tip]; expose a setter for convenience
function tip(node, text) { if (text) node.dataset.tip = text; return node; }

// Instances (created in bind()).
let taskContactCombo, taskPriorityDd, refContactCombo, taskDuePicker, refDatePicker;

// =====================================================================
// MONTH GRID
// =====================================================================
function cellGet(pid, year, m) { const a = state.contacted[pid] && state.contacted[pid][year]; return !!(a && a[m]); }
function cellSet(pid, year, m, v) {
  if (!state.contacted[pid]) state.contacted[pid] = {};
  if (!Array.isArray(state.contacted[pid][year])) state.contacted[pid][year] = new Array(12).fill(false);
  state.contacted[pid][year][m] = v;
}
// checkmark centered within the 24×24 viewBox (bbox x:5–19 → cx 12, y:7–17 → cy 12)
const CHECK_SVG = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17 19 7"/></svg>';
function renderGrid() {
  const head = document.getElementById('gridHead'), body = document.getElementById('gridBody'), foot = document.getElementById('gridFoot');
  const empty = document.getElementById('gridEmpty'), table = document.getElementById('grid');
  head.textContent = ''; body.textContent = ''; foot.textContent = '';
  if (!state.contacts.length) { empty.classList.remove('hidden'); table.classList.add('hidden'); return; }
  empty.classList.add('hidden'); table.classList.remove('hidden');

  const htr = el('tr');
  const hn = el('th', 'name-col', 'Person'); htr.appendChild(hn);
  MONTHS.forEach((label, m) => {
    const th = el('th', 'month-col', label);
    const allOn = state.contacts.every(p => cellGet(p.id, state.year, m));
    th.dataset.tip = (allOn ? 'Fjern alle i ' : 'Merk alle i ') + MONTHS_FULL[m];
    th.addEventListener('click', () => toggleMonthAll(m));
    htr.appendChild(th);
  });
  head.appendChild(htr);

  state.contacts.forEach(p => {
    const tr = el('tr');
    const nameTd = el('td', 'name-col');
    const wrap = el('div', 'person-cell');
    const ini = el('span', 'person-initials', p.initials);
    ini.dataset.tip = 'Vis detaljer'; ini.setAttribute('role', 'button'); ini.tabIndex = 0;
    ini.addEventListener('click', () => openContactDetail(p.id));
    ini.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openContactDetail(p.id); } });
    const del = el('button', 'row-del'); del.innerHTML = icon('x'); del.setAttribute('aria-label', 'Fjern ' + p.initials);
    del.addEventListener('click', () => deleteContact(p.id));
    wrap.append(ini, del); nameTd.appendChild(wrap); tr.appendChild(nameTd);

    for (let m = 0; m < 12; m++) {
      const td = el('td');
      const btn = el('button');
      const on = cellGet(p.id, state.year, m);
      btn.className = 'cell-btn' + (on ? ' on' : '');
      btn.setAttribute('aria-label', MONTHS[m] + ': ' + (on ? 'kontaktet' : 'ikke kontaktet'));
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) btn.innerHTML = CHECK_SVG;
      btn.addEventListener('click', () => {
        const next = !cellGet(p.id, state.year, m);
        cellSet(p.id, state.year, m, next);
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        btn.setAttribute('aria-label', MONTHS[m] + ': ' + (next ? 'kontaktet' : 'ikke kontaktet'));
        btn.innerHTML = next ? CHECK_SVG : '';
        renderFoot(); scheduleSave();
      });
      td.appendChild(btn); tr.appendChild(td);
    }
    body.appendChild(tr);
  });
  renderFoot();
}
// Bulk-mark a whole month for everyone. An EMPTY column just fills (no friction
// — that's the common initial-setup case). If the column already has anything in
// it, confirm first so an accidental click can't wipe/overwrite a column.
function toggleMonthAll(m) {
  if (!state.contacts.length) return;
  const apply = (next) => { state.contacts.forEach(p => cellSet(p.id, state.year, m, next)); renderGrid(); scheduleSave(); };
  const anyOn = state.contacts.some(p => cellGet(p.id, state.year, m));
  if (!anyOn) { apply(true); return; }
  const allOn = state.contacts.every(p => cellGet(p.id, state.year, m));
  const next = !allOn; // fill the rest, or (if already all on) clear
  confirmModal({
    title: MONTHS_FULL[m] + ' ' + state.year,
    body: next
      ? ('Marker alle som kontaktet i ' + MONTHS_FULL[m] + '? Dette overskriver det som allerede er registrert i kolonnen.')
      : ('Fjerne kontaktmarkering for alle i ' + MONTHS_FULL[m] + '? Dette kan ikke angres.'),
    confirmLabel: next ? 'Marker alle' : 'Fjern alle',
    danger: !next,
    onConfirm: () => apply(next),
  });
}
function renderFoot() {
  const foot = document.getElementById('gridFoot'); foot.textContent = '';
  const total = state.contacts.length;
  const tr = el('tr');
  tr.appendChild(el('td', 'name-col', 'Kontaktet'));
  for (let m = 0; m < 12; m++) {
    const td = el('td');
    const n = state.contacts.reduce((a, p) => a + (cellGet(p.id, state.year, m) ? 1 : 0), 0);
    const pv = total ? Math.round((n / total) * 100) : 0;
    const pct = el('div', 'pct' + (n === 0 ? ' zero' : ''), pv + '%');
    const sub = el('div', 'pct-sub', n + '/' + total);
    const bar = el('div', 'pct-bar'); const fill = el('span'); fill.style.width = pv + '%'; bar.appendChild(fill);
    td.append(pct, sub, bar); tr.appendChild(td);
  }
  foot.appendChild(tr);
}

// =====================================================================
// shared chip / meta builders
// =====================================================================
function personChip(contactId) {
  const who = initialsFor(contactId);
  if (!who) return null;
  const c = el('span', 'chip person clickable');
  const i = el('span', 'ic'); i.innerHTML = icon('user'); i.querySelector('svg').setAttribute('stroke-width', '2');
  c.append(i, el('span', null, who));
  c.dataset.tip = 'Vis detaljer'; c.setAttribute('role', 'button'); c.tabIndex = 0;
  c.addEventListener('click', (e) => { e.stopPropagation(); openContactDetail(contactId); });
  c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openContactDetail(contactId); } });
  return c;
}
function dueChip(due) {
  if (!due) return null;
  const c = el('span', 'chip due' + (isOverdue(due) ? ' overdue' : ''));
  c.textContent = (isOverdue(due) ? 'Forfalt · ' : '') + fmtDate(due);
  return c;
}

// =====================================================================
// KONTAKT-DETALJ — a modal showing everything about one contact: this
// year's month-by-month contact history (clickable to toggle), their
// linked gjøremål and referater, plus quick-add + delete actions. The
// body re-renders in place after every mutation so counts stay current.
// Public API: openContactDetail(contactId) — also the jump target for a
// future search feature (open a person straight from a result).
// =====================================================================
function openContactDetail(contactId) {
  const c = contactById(contactId);
  if (!c) return;

  const body = el('div', 'cd');
  // No modal title here: the identity lives once in the .cd-header (avatar +
  // initials-as-name + "Kontakt" subline). A redundant title would repeat the
  // initials a third time.
  const m = openModal({ bodyNode: body, width: 520 });

  // a small titled section: subheader + a content node
  function section(title, count, node) {
    const sec = el('div', 'cd-section');
    const head = el('div', 'cd-subhead');
    head.appendChild(el('span', 'cd-subhead-title', title));
    if (count != null) head.appendChild(el('span', 'cd-count', String(count)));
    sec.append(head, node);
    return sec;
  }

  function rebuild() {
    body.textContent = '';

    // --- header: avatar + initials title ---
    const header = el('div', 'cd-header');
    const av = el('span', 'avatar lg', c.initials);
    const meta = el('div', 'cd-header-meta');
    meta.appendChild(el('div', 'cd-header-title', c.initials));
    meta.appendChild(el('div', 'cd-header-sub', 'Kontakt'));
    header.append(av, meta);
    body.appendChild(header);

    // --- kontakt-historikk: 12 month pills + year % ---
    const histNode = el('div', 'cd-hist');
    const pills = el('div', 'cd-pills');
    let n = 0;
    for (let mo = 0; mo < 12; mo++) {
      const on = cellGet(c.id, state.year, mo);
      if (on) n++;
      const pill = el('button', 'cd-pill' + (on ? ' on' : ''));
      pill.type = 'button';
      pill.textContent = MONTHS[mo];
      pill.setAttribute('aria-pressed', on ? 'true' : 'false');
      pill.dataset.tip = (on ? 'Fjern ' : 'Merk ') + MONTHS_FULL[mo];
      pill.addEventListener('click', () => {
        cellSet(c.id, state.year, mo, !cellGet(c.id, state.year, mo));
        renderGrid();        // keep the Oversikt grid in sync
        scheduleSave();
        rebuild();           // refresh pills + percentage
      });
      pills.appendChild(pill);
    }
    const pct = Math.round((n / 12) * 100);
    const summary = el('div', 'cd-hist-summary');
    summary.appendChild(el('span', 'cd-hist-pct', pct + '%'));
    summary.appendChild(el('span', 'cd-hist-sub', n + '/12 måneder · ' + state.year));
    histNode.append(pills, summary);
    body.appendChild(section('Kontakt-historikk', null, histNode));

    // --- gjøremål (active first, then done) ---
    const tasks = state.tasks.filter(t => t.contactId === c.id);
    const tActive = tasks.filter(t => !t.done).sort((a, b) => {
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
    });
    const tDone = tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const tList = el('div', 'item-list cd-list');
    if (!tasks.length) tList.appendChild(el('div', 'list-empty', 'Ingen gjøremål.'));
    else [...tActive, ...tDone].forEach(t => tList.appendChild(cdTaskEl(t, rebuild)));
    body.appendChild(section('Gjøremål', tasks.length, tList));

    // --- referat ---
    const refs = state.referater.filter(r => r.contactId === c.id);
    const rActive = refs.filter(r => !r.done).sort((a, b) => {
      if (!!a.date !== !!b.date) return a.date ? -1 : 1;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    const rDone = refs.filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const rList = el('div', 'item-list cd-list');
    if (!refs.length) rList.appendChild(el('div', 'list-empty', 'Ingen referat-påminnelser.'));
    else [...rActive, ...rDone].forEach(r => rList.appendChild(cdReferatEl(r, rebuild)));
    body.appendChild(section('Referat', refs.length, rList));

    // --- quick-add (title input + add) for task / referat, linked to this contact ---
    body.appendChild(cdQuickAdd(c.id, rebuild));

    // --- danger: remove contact (reuses the existing confirm + cleanup flow) ---
    const danger = el('div', 'cd-danger');
    const rm = button({ label: 'Fjern kontakt', variant: 'danger', icon: 'trash', sm: true,
      onClick: () => { m.close(); deleteContact(c.id); } });
    danger.appendChild(rm);
    body.appendChild(danger);
  }

  rebuild();
}

// A compact task card for the detail modal: same look as the Gjøremål view,
// but mutations re-render the modal (via `refresh`) instead of the main list.
function cdTaskEl(t, refresh) {
  const row = el('div', 'item prio-' + t.priority + (t.done ? ' is-done' : ''));
  const cb = buildCheckbox({ checked: t.done, onChange: (v) => {
    t.done = v; t.doneAt = t.done ? Date.now() : null;
    renderTasks(); scheduleSave(); refresh();
  } });
  cb.el.setAttribute('aria-label', 'Marker som fullført');
  const main = el('div', 'item-main');
  main.appendChild(el('div', 'item-title', t.title));
  if (t.note) main.appendChild(el('div', 'item-note', t.note));
  const meta = el('div', 'item-meta');
  const dc = dueChip(t.due); if (dc) meta.appendChild(dc);
  if (t.priority !== 'normal') meta.appendChild(el('span', 'chip prio-' + t.priority, PRIO_LABEL[t.priority]));
  if (meta.children.length) main.appendChild(meta);
  row.append(cb.el, main);
  return row;
}

// A compact referat card for the detail modal.
function cdReferatEl(r, refresh) {
  const row = el('div', 'item ref' + (r.done ? ' is-done' : ''));
  const cb = buildCheckbox({ checked: r.done, onChange: (v) => {
    r.done = v; r.doneAt = r.done ? Date.now() : null;
    renderReferat(); scheduleSave(); refresh();
  } });
  cb.el.setAttribute('aria-label', 'Marker som skrevet');
  const main = el('div', 'item-main');
  main.appendChild(el('div', 'item-title', r.title));
  if (r.note) main.appendChild(el('div', 'item-note', r.note));
  const meta = el('div', 'item-meta');
  if (r.date) meta.appendChild(el('span', 'chip due', fmtDate(r.date)));
  if (meta.children.length) main.appendChild(meta);
  row.append(cb.el, main);
  return row;
}

// Inline mini quick-add: a title field + two add buttons that create a task or
// a referat already linked to this contactId (due/date defaults to today), then
// refresh the modal. Self-contained — no navigation, native-free.
function cdQuickAdd(contactId, refresh) {
  const wrap = el('div', 'cd-quickadd');
  const input = document.createElement('input');
  input.className = 'field'; input.type = 'text'; input.maxLength = 200;
  input.placeholder = 'Ny tittel…';
  const addTask = () => {
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    state.tasks.push({ id: uid(), title, note: '', due: todayStr(), priority: 'normal',
      contactId, done: false, createdAt: Date.now(), doneAt: null });
    input.value = ''; renderTasks(); scheduleSave(); refresh();
  };
  const addRef = () => {
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    state.referater.push({ id: uid(), title, note: '', date: todayStr(),
      contactId, done: false, createdAt: Date.now(), doneAt: null });
    input.value = ''; renderReferat(); scheduleSave(); refresh();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } });
  const acts = el('div', 'cd-quickadd-acts');
  acts.append(
    button({ label: 'Gjøremål', variant: 'secondary', icon: 'plus', sm: true, onClick: addTask }),
    button({ label: 'Referat', variant: 'secondary', icon: 'plus', sm: true, onClick: addRef }),
  );
  wrap.append(input, acts);
  return section_quickadd(wrap);
}
// tiny wrapper so quick-add gets the same subheader treatment as a section
function section_quickadd(node) {
  const sec = el('div', 'cd-section');
  const head = el('div', 'cd-subhead');
  head.appendChild(el('span', 'cd-subhead-title', 'Legg til'));
  sec.append(head, node);
  return sec;
}

// =====================================================================
// item enter/leave animation (tasks + referater)
// =====================================================================
// id of an item that should play its "appear" animation on the next render
// (a freshly-added item, or one that just moved between the active/done lists).
let pendingEnterId = null;
// Collapse + fade a row out, THEN run `done` (which re-renders). Measuring the
// height first lets max-height animate to 0 for a smooth collapse.
function animateOut(row, done) {
  let fired = false;
  const finish = () => { if (fired) return; fired = true; done(); };
  row.style.maxHeight = row.offsetHeight + 'px';
  row.classList.add('leaving');
  requestAnimationFrame(() => {
    row.style.maxHeight = '0px';
    row.style.opacity = '0';
    row.style.marginTop = '0px';
    row.style.paddingTop = '0px';
    row.style.paddingBottom = '0px';
  });
  row.addEventListener('transitionend', (e) => { if (e.propertyName === 'max-height') finish(); }, { once: true });
  setTimeout(finish, 380); // fallback if transitionend never fires
}

// =====================================================================
// TASKS
// =====================================================================
function taskEl(t) {
  const row = el('div', 'item prio-' + t.priority + (t.done ? ' is-done' : '') + (t.id === pendingEnterId ? ' entering' : ''));
  row.dataset.id = t.id;
  const cb = buildCheckbox({ checked: t.done, onChange: (v) => {
    t.done = v; t.doneAt = t.done ? Date.now() : null;
    pendingEnterId = t.id;            // play "appear" in the list it moves to
    scheduleSave();
    animateOut(row, renderTasks);     // collapse out of the current list first
  } });
  cb.el.setAttribute('aria-label', 'Marker som fullført');
  const main = el('div', 'item-main');
  main.appendChild(el('div', 'item-title', t.title));
  if (t.note) main.appendChild(el('div', 'item-note', t.note));
  const meta = el('div', 'item-meta');
  const dc = dueChip(t.due); if (dc) meta.appendChild(dc);
  if (t.priority !== 'normal') { const pc = el('span', 'chip prio-' + t.priority, PRIO_LABEL[t.priority]); meta.appendChild(pc); }
  const pc2 = personChip(t.contactId); if (pc2) meta.appendChild(pc2);
  if (meta.children.length) main.appendChild(meta);
  const acts = el('div', 'item-acts');
  if (!t.done) {
    const bump = el('button', 'item-act'); bump.innerHTML = icon('calendar-plus');
    bump.setAttribute('aria-label', 'Utsett til neste dag'); bump.dataset.tip = 'Utsett én dag';
    bump.addEventListener('click', () => { t.due = addDays(t.due, 1); renderTasks(); scheduleSave(); });
    acts.appendChild(bump);
  }
  const del = el('button', 'item-del'); del.innerHTML = icon('trash'); del.setAttribute('aria-label', 'Slett');
  del.addEventListener('click', () => animateOut(row, () => { state.tasks = state.tasks.filter(x => x.id !== t.id); renderTasks(); scheduleSave(); }));
  acts.appendChild(del);
  row.append(cb.el, main, acts);
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
  if (!act.length) active.appendChild(el('div', 'list-empty', 'Ingen aktive gjøremål.'));
  else act.forEach(t => active.appendChild(taskEl(t)));
  fin.forEach(t => done.appendChild(taskEl(t)));
  document.getElementById('taskDoneCount').textContent = String(fin.length);
  renderBadges();
  pendingEnterId = null; // consumed by whichever row just rendered with .entering
}

// =====================================================================
// REFERAT reminders
// =====================================================================
function referatEl(r) {
  const row = el('div', 'item ref' + (r.done ? ' is-done' : '') + (r.id === pendingEnterId ? ' entering' : ''));
  row.dataset.id = r.id;
  const cb = buildCheckbox({ checked: r.done, onChange: (v) => {
    r.done = v; r.doneAt = r.done ? Date.now() : null;
    pendingEnterId = r.id;
    scheduleSave();
    animateOut(row, renderReferat);
  } });
  cb.el.setAttribute('aria-label', 'Marker som skrevet');
  const main = el('div', 'item-main');
  main.appendChild(el('div', 'item-title', r.title));
  if (r.note) main.appendChild(el('div', 'item-note', r.note));
  const meta = el('div', 'item-meta');
  if (r.date) { const dc = el('span', 'chip due', fmtDate(r.date)); meta.appendChild(dc); }
  const pc = personChip(r.contactId); if (pc) meta.appendChild(pc);
  if (meta.children.length) main.appendChild(meta);
  const del = el('button', 'item-del'); del.innerHTML = icon('trash'); del.setAttribute('aria-label', 'Slett');
  del.addEventListener('click', () => animateOut(row, () => { state.referater = state.referater.filter(x => x.id !== r.id); renderReferat(); scheduleSave(); }));
  row.append(cb.el, main, del);
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
  if (!act.length) active.appendChild(el('div', 'list-empty', 'Ingen påminnelser.'));
  else act.forEach(r => active.appendChild(referatEl(r)));
  fin.forEach(r => done.appendChild(referatEl(r)));
  document.getElementById('refDoneCount').textContent = String(fin.length);
  renderBadges();
  pendingEnterId = null;
}

// =====================================================================
// KALENDER (agenda) — combines dated, non-done tasks + referater into a
// single list, grouped into time buckets (overdue → today → … → later).
// Reuses the .item look + the shared chip/personChip builders.
// =====================================================================
const AGENDA_BUCKETS = [
  { key: 'forfalt', label: 'Forfalt' },
  { key: 'idag',    label: 'I dag' },
  { key: 'imorgen', label: 'I morgen' },
  { key: 'uken',    label: 'Denne uken' },
  { key: 'senere',  label: 'Senere' },
];
// Decide which bucket a 'YYYY-MM-DD' falls in, relative to today.
function agendaBucket(date) {
  const today = todayStr();
  if (date < today) return 'forfalt';
  if (date === today) return 'idag';
  const tomorrow = addDays(today, 1);
  if (date === tomorrow) return 'imorgen';
  if (date <= addDays(today, 7)) return 'uken';
  return 'senere';
}
// Gather every non-done task (with a due) + referat (with a date) as entries.
function agendaEntries() {
  const out = [];
  state.tasks.forEach(t => { if (!t.done && t.due) out.push({ kind: 'task', date: t.due, ref: t }); });
  state.referater.forEach(r => { if (!r.done && r.date) out.push({ kind: 'ref', date: r.date, ref: r }); });
  return out;
}
// Re-render every agenda-driven surface (kalender + the Hjem "I dag" block) so
// quick-actions behave identically no matter which view the card lives on.
function refreshAgendaViews() { renderKalender(); renderHjem(); renderBadges(); }
// --- Kalender view state (not persisted; defaults to list + the real month) ---
let kalenderView = 'liste';            // 'liste' | 'maned'
const _now0 = new Date();
let calY = _now0.getFullYear();        // visible month for the grid
let calM = _now0.getMonth();           // 0-based
function agendaCardEl(entry) {
  const { kind, ref: it } = entry;
  const row = el('div', 'item' + (kind === 'ref' ? ' ref' : ' prio-' + it.priority) + (it.id === pendingEnterId ? ' entering' : ''));
  const cb = buildCheckbox({ checked: false, onChange: () => {
    it.done = true; it.doneAt = Date.now();
    scheduleSave();
    animateOut(row, refreshAgendaViews);
  } });
  cb.el.setAttribute('aria-label', kind === 'ref' ? 'Marker som skrevet' : 'Marker som fullført');

  const main = el('div', 'item-main');
  main.appendChild(el('div', 'item-title', it.title));
  if (it.note) main.appendChild(el('div', 'item-note', it.note));
  const meta = el('div', 'item-meta');
  const typeChip = el('span', 'chip' + (kind === 'ref' ? ' ok' : ' outline'), kind === 'ref' ? 'Referat' : 'Gjøremål');
  meta.appendChild(typeChip);
  const dc = el('span', 'chip due' + (isOverdue(entry.date) ? ' overdue' : ''));
  dc.textContent = (isOverdue(entry.date) ? 'Forfalt · ' : '') + fmtDate(entry.date);
  meta.appendChild(dc);
  if (kind === 'task' && it.priority !== 'normal') meta.appendChild(el('span', 'chip prio-' + it.priority, PRIO_LABEL[it.priority]));
  const pc = personChip(it.contactId); if (pc) meta.appendChild(pc);
  main.appendChild(meta);

  const setDate = (v) => { if (kind === 'ref') it.date = v; else it.due = v; refreshAgendaViews(); scheduleSave(); };
  const acts = el('div', 'item-acts');
  const today = el('button', 'item-act'); today.innerHTML = icon('calendar');
  today.setAttribute('aria-label', 'Sett til i dag'); today.dataset.tip = 'I dag';
  today.addEventListener('click', () => setDate(todayStr()));
  const bump = el('button', 'item-act'); bump.innerHTML = icon('calendar-plus');
  bump.setAttribute('aria-label', 'Utsett én dag'); bump.dataset.tip = '+1 dag';
  bump.addEventListener('click', () => setDate(addDays(entry.date, 1)));
  acts.append(today, bump);

  row.append(cb.el, main, acts);
  return row;
}
// Sort agenda entries: date asc, then high→normal→low priority (tasks).
function agendaSort(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const pr = (e) => e.kind === 'task' ? PRIO_RANK[e.ref.priority] : 1;
  return pr(a) - pr(b);
}
// Render the Liste view (agenda buckets) into #agendaRoot.
function renderAgendaList() {
  const root = document.getElementById('agendaRoot');
  if (!root) return;
  root.textContent = '';
  const entries = agendaEntries();
  if (!entries.length) {
    root.appendChild(el('div', 'list-empty', 'Ingenting planlagt.'));
    return;
  }
  AGENDA_BUCKETS.forEach(bucket => {
    const items = entries.filter(e => agendaBucket(e.date) === bucket.key).sort(agendaSort);
    if (!items.length) return;
    const group = el('div', 'agenda-group');
    group.appendChild(el('div', 'agenda-label' + (bucket.key === 'forfalt' ? ' overdue' : ''), bucket.label));
    const list = el('div', 'item-list');
    items.forEach(e => list.appendChild(agendaCardEl(e)));
    group.appendChild(list);
    root.appendChild(group);
  });
}

// 'YYYY-MM-DD' for a y/m(0-based)/day triple.
function ymd(y, m, day) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Jump the grid to a real month and (if visible) re-render.
function setCalMonth(y, m) {
  // normalize month overflow/underflow into the year
  calY = y + Math.floor(m / 12);
  calM = ((m % 12) + 12) % 12;
  if (kalenderView === 'maned') renderMonthGrid();
}

// Build the toolbar (Liste/Måned toggle + — for Måned — month nav).
function renderKalToolbar() {
  const bar = document.getElementById('kalToolbar');
  if (!bar) return;
  bar.textContent = '';

  const seg = buildSegmented({
    value: kalenderView,
    items: [{ value: 'liste', label: 'Liste' }, { value: 'maned', label: 'Måned' }],
    onChange: (v) => { kalenderView = v; renderKalender(); },
  });
  bar.appendChild(seg.el);

  if (kalenderView === 'maned') {
    const nav = el('div', 'month-nav');
    const prev = el('button', 'icon-btn sm'); prev.innerHTML = icon('chevron-left');
    prev.setAttribute('aria-label', 'Forrige måned');
    prev.addEventListener('click', () => setCalMonth(calY, calM - 1));
    const label = el('span', 'month-label', MONTHS_FULL[calM] + ' ' + calY);
    const next = el('button', 'icon-btn sm'); next.innerHTML = icon('chevron-right');
    next.setAttribute('aria-label', 'Neste måned');
    next.addEventListener('click', () => setCalMonth(calY, calM + 1));
    nav.append(prev, label, next);

    const today = el('button', 'btn sm'); today.type = 'button'; today.textContent = 'I dag';
    today.addEventListener('click', () => {
      const n = new Date();
      setCalMonth(n.getFullYear(), n.getMonth());
    });
    nav.appendChild(today);
    bar.appendChild(nav);
  }
}

// One compact item pill inside a day cell.
function monthItemPill(entry) {
  const { kind, ref: it } = entry;
  const overdue = isOverdue(entry.date);
  const pill = el('button', 'mc-item' + (kind === 'ref' ? ' ref' : ' task') + (overdue ? ' overdue' : ''));
  pill.type = 'button';
  pill.appendChild(el('span', 'mc-dot'));
  pill.appendChild(el('span', 'mc-item-title', it.title || (kind === 'ref' ? 'Referat' : 'Gjøremål')));
  const tipKind = kind === 'ref' ? 'Referat' : 'Gjøremål';
  // Hover/focus → a JS-positioned floating popover (appended to #modalMount, NOT
  // the day cell) so it floats above everything and is clamped to the viewport,
  // instead of the old CSS [data-tip] that got clipped by .mc-cell's overflow.
  const showPop = () => showMonthPop(pill, { kind: tipKind, title: it.title, date: entry.date, contactId: it.contactId });
  pill.addEventListener('mouseenter', showPop);
  pill.addEventListener('focus', showPop);
  pill.addEventListener('mouseleave', hideMonthPop);
  pill.addEventListener('blur', hideMonthPop);
  // Clicking opens the linked contact if any; otherwise jumps to its page.
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    hideMonthPop();
    if (it.contactId && contactById(it.contactId)) openContactDetail(it.contactId);
    else setView(kind === 'ref' ? 'referat' : 'tasks');
  });
  return pill;
}

// Floating popover for month-grid pills. Lives in #modalMount (position:fixed,
// high z-index) so it's never clipped by .mc-cell/.month-card overflow, and is
// clamped/flipped to stay fully inside the window.
let _mcPop = null;
function hideMonthPop() {
  if (_mcPop) { _mcPop.remove(); _mcPop = null; }
}
function showMonthPop(anchor, info) {
  hideMonthPop();
  const pop = el('div', 'mc-pop');
  pop.appendChild(el('div', 'mc-pop-kind', info.kind));
  pop.appendChild(el('div', 'mc-pop-title', info.title || (info.kind === 'Referat' ? 'Referat' : 'Gjøremål')));
  const metaBits = [];
  if (info.date) metaBits.push(fmtDate(info.date));
  if (info.contactId) { const c = contactById(info.contactId); if (c) metaBits.push(c.initials); }
  if (metaBits.length) pop.appendChild(el('div', 'mc-pop-meta', metaBits.join(' · ')));
  (modalMount || document.body).appendChild(pop);

  // Position: prefer above the pill, flip below if it would clip the top.
  // Then clamp horizontally so it never overflows either window edge.
  const a = anchor.getBoundingClientRect();
  const pad = 8;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let top = a.top - ph - pad;
  if (top < pad) top = a.bottom + pad;                    // flip below
  if (top + ph > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - ph - pad);
  let left = a.left + a.width / 2 - pw / 2;                // center on pill
  left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

// Render the Måned view (month grid) into #monthRoot.
const MAX_CELL_ITEMS = 3;
function renderMonthGrid() {
  const root = document.getElementById('monthRoot');
  if (!root) return;
  hideMonthPop(); // drop any lingering popover before the grid is rebuilt
  root.textContent = '';
  renderKalToolbar(); // keep the month label in sync

  // Group entries by date for O(1) cell lookup.
  const byDate = {};
  agendaEntries().forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });

  // weekday header row (Mon–Sun)
  const head = el('div', 'mc-head');
  DOW.forEach(d => head.appendChild(el('div', 'mc-dow', d)));
  root.appendChild(head);

  // First cell = Monday on/just before the 1st. getDay(): 0=Sun..6=Sat → Mon-index.
  const first = new Date(calY, calM, 1);
  const mondayIdx = (first.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(calY, calM, 1 - mondayIdx);

  const today = todayStr();
  const body = el('div', 'mc-grid');
  // 6 weeks always = stable height; trailing weeks that are fully next-month are dropped.
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      cells.push(date);
    }
    weeks.push(cells);
  }
  // Drop a 6th week if it's entirely outside the visible month.
  const lastWeek = weeks[5];
  if (lastWeek.every(dt => dt.getMonth() !== calM)) weeks.pop();

  weeks.forEach(cells => {
    cells.forEach(date => {
      const inMonth = date.getMonth() === calM;
      const ds = ymd(date.getFullYear(), date.getMonth(), date.getDate());
      const isToday = ds === today;
      const cell = el('div', 'mc-cell'
        + (inMonth ? '' : ' muted')
        + (isToday ? ' today' : ''));

      const dnum = el('div', 'mc-daynum', String(date.getDate()));
      cell.appendChild(dnum);

      const items = (byDate[ds] || []).slice().sort(agendaSort);
      if (items.length) {
        const list = el('div', 'mc-items');
        items.slice(0, MAX_CELL_ITEMS).forEach(e => list.appendChild(monthItemPill(e)));
        cell.appendChild(list);
        if (items.length > MAX_CELL_ITEMS) {
          const more = el('div', 'mc-more', '+' + (items.length - MAX_CELL_ITEMS) + ' til');
          more.dataset.tip = items.slice(MAX_CELL_ITEMS).map(e => e.ref.title || (e.kind === 'ref' ? 'Referat' : 'Gjøremål')).join('\n');
          cell.appendChild(more);
        }
        // compact/narrow fallback: dot summary (shown via CSS under a width breakpoint)
        const dots = el('div', 'mc-dots');
        items.slice(0, 5).forEach(e => dots.appendChild(el('span', 'mc-dot' + (e.kind === 'ref' ? ' ref' : ' task') + (isOverdue(e.date) ? ' overdue' : ''))));
        if (items.length > 5) dots.appendChild(el('span', 'mc-dots-count', '+' + (items.length - 5)));
        cell.appendChild(dots);
      }
      body.appendChild(cell);
    });
  });
  root.appendChild(body);
}

function renderKalender() {
  const list = document.getElementById('agendaRoot');
  const month = document.getElementById('monthRoot');
  if (!list || !month) return;
  renderKalToolbar();
  const showMonth = kalenderView === 'maned';
  list.classList.toggle('hidden', showMonth);
  month.classList.toggle('hidden', !showMonth);
  if (showMonth) renderMonthGrid();
  else renderAgendaList();
  pendingEnterId = null;
}

// =====================================================================
// HJEM (dashboard / landing) — a polished at-a-glance front page:
// greeting + date, a row of stat tiles computed from the REAL current
// month/year, today's (and overdue) agenda reusing the kalender card
// builder, and quick-link shortcuts. Recomputed every time it renders.
// =====================================================================
function greetingFor(hour) {
  if (hour < 12) return 'God morgen';
  if (hour < 18) return 'God dag';
  return 'God kveld';
}
function capitalizeFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// One stat tile: a tinted icon badge + big number (optionally tinted) + label
// + optional subline. `tone` ('danger'|'accent'|'ok'|null) tints num + badge.
function statTile({ value, label, sub, tone, icon: ic }) {
  const card = el('div', 'stat-tile' + (tone ? ' tone-' + tone : ''));
  if (ic) {
    const badge = el('span', 'stat-ic'); badge.innerHTML = icon(ic);
    card.appendChild(badge);
  }
  const txt = el('div', 'stat-txt');
  const num = el('div', 'stat-num' + (tone ? ' ' + tone : ''), String(value));
  txt.appendChild(num);
  txt.appendChild(el('div', 'stat-label', label));
  if (sub != null) txt.appendChild(el('div', 'stat-sub', sub));
  card.appendChild(txt);
  return card;
}
function renderHjem() {
  const greetEl = document.getElementById('hjemGreeting');
  const dateEl = document.getElementById('hjemDate');
  const statsEl = document.getElementById('hjemStats');
  const todayEl = document.getElementById('hjemToday');
  const shortEl = document.getElementById('hjemShortcuts');
  if (!greetEl || !statsEl || !todayEl) return;

  const now = new Date();
  greetEl.textContent = greetingFor(now.getHours());
  const ds = now.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  dateEl.textContent = capitalizeFirst(ds);

  // --- stats (real current month/year) ---
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const today = todayStr();
  const total = state.contacts.length;
  const contactedN = state.contacts.reduce((a, c) => a + (cellGet(c.id, curY, curM) ? 1 : 0), 0);
  const contactedPct = total ? Math.round((contactedN / total) * 100) : 0;

  const overdueN = state.tasks.filter(t => !t.done && isOverdue(t.due)).length
    + state.referater.filter(r => !r.done && isOverdue(r.date)).length;
  const todayN = state.tasks.filter(t => !t.done && t.due === today).length
    + state.referater.filter(r => !r.done && r.date === today).length;
  const weekEnd = addDays(today, 6);
  const inWeek = (d) => !!d && d >= today && d <= weekEnd;
  const weekN = state.tasks.filter(t => !t.done && inWeek(t.due)).length
    + state.referater.filter(r => !r.done && inWeek(r.date)).length;

  statsEl.textContent = '';
  statsEl.appendChild(statTile({
    value: contactedPct + '%', label: 'Kontaktet denne måneden',
    sub: contactedN + '/' + total, icon: 'user',
  }));
  statsEl.appendChild(statTile({
    value: overdueN, label: 'Forfalt', tone: overdueN > 0 ? 'danger' : null,
    sub: overdueN === 1 ? 'oppgave' : 'oppgaver', icon: 'alert-triangle',
  }));
  statsEl.appendChild(statTile({
    value: todayN, label: 'I dag', tone: todayN > 0 ? 'accent' : null,
    sub: todayN === 1 ? 'oppgave' : 'oppgaver', icon: 'calendar',
  }));
  statsEl.appendChild(statTile({
    value: weekN, label: 'Denne uken',
    sub: weekN === 1 ? 'oppgave' : 'oppgaver', icon: 'check-square',
  }));

  // --- "I dag" agenda (today + overdue), reusing the kalender card builder ---
  todayEl.textContent = '';
  const due = agendaEntries()
    .filter(e => e.date <= today)            // overdue + today
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const pr = (e) => e.kind === 'task' ? PRIO_RANK[e.ref.priority] : 1;
      return pr(a) - pr(b);
    });
  if (!due.length) {
    todayEl.appendChild(el('div', 'list-empty', 'Ingenting står på planen i dag.'));
  } else {
    due.forEach(e => todayEl.appendChild(agendaCardEl(e)));
  }

  // --- Hurtignotat (quick-note capture + recent notes) ---
  renderQuickNotes();

  // --- shortcuts ---
  if (shortEl) {
    shortEl.textContent = '';
    [
      { nav: 'tasks', icon: 'check-square', label: 'Gjøremål & referat' },
      { nav: 'kalender', icon: 'calendar', label: 'Kalender' },
      { nav: 'oversikt', icon: 'grid', label: 'Oversikt' },
    ].forEach(s => {
      const b = el('button', 'shortcut'); b.type = 'button';
      const i = el('span', 'ic'); i.innerHTML = icon(s.icon);
      b.append(i, el('span', null, s.label));
      b.addEventListener('click', () => setView(s.nav));
      shortEl.appendChild(b);
    });
  }
}

// --- quick-note capture ---------------------------------------------
const MAX_HJEM_NOTES = 5;          // how many recent notes the Hjem card shows
function addNote(text) {
  const t = (text || '').trim();
  if (!t) return false;
  state.notes.unshift({ id: uid(), text: t.slice(0, 2000), createdAt: Date.now() });
  scheduleSave();
  return true;
}
function deleteNote(id) {
  const before = state.notes.length;
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.notes.length !== before) { scheduleSave(); renderQuickNotes(); }
}
// One small note card: text + relative timestamp + delete (x).
function quickNoteEl(n) {
  const row = el('div', 'qn-note');
  const main = el('div', 'qn-note-main');
  main.appendChild(el('div', 'qn-note-text', n.text));
  main.appendChild(el('div', 'qn-note-time', relTime(n.createdAt)));
  const del = el('button', 'qn-note-del'); del.innerHTML = icon('x');
  del.setAttribute('aria-label', 'Slett notat');
  del.dataset.tip = 'Slett';
  del.addEventListener('click', () => deleteNote(n.id));
  row.append(main, del);
  return row;
}
// Render the input + recent-notes list inside the Hurtignotat card.
function renderQuickNotes() {
  const input = document.getElementById('quickNoteInput');
  const listEl = document.getElementById('quickNoteList');
  if (!listEl) return;
  // input + Enter-to-save are bound once (bindQuickNote); here we just paint the list.
  listEl.textContent = '';
  const recent = (state.notes || []).slice(0, MAX_HJEM_NOTES);
  if (!recent.length) {
    listEl.appendChild(el('div', 'qn-empty', 'Ingen notater ennå — skriv et raskt notat over.'));
  } else {
    recent.forEach(n => listEl.appendChild(quickNoteEl(n)));
  }
  // hint at any overflow beyond what we show
  const extra = (state.notes || []).length - recent.length;
  if (extra > 0) listEl.appendChild(el('div', 'qn-more', '+' + extra + ' eldre ' + (extra === 1 ? 'notat' : 'notater')));
  void input; // referenced for clarity; binding lives in bindQuickNote
}
// Wire the Hurtignotat input once: Enter (without Shift) or the button saves.
function bindQuickNote() {
  const input = document.getElementById('quickNoteInput');
  const addBtn = document.getElementById('quickNoteAdd');
  if (!input || !addBtn) return;
  const save = () => {
    if (addNote(input.value)) { input.value = ''; renderQuickNotes(); input.focus(); }
  };
  addBtn.addEventListener('click', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
  });
}

// =====================================================================
// nav / badges / year
// =====================================================================
function renderBadges() {
  // combined view → single badge of open gjøremål + referater
  const open = state.tasks.filter(x => !x.done).length + state.referater.filter(x => !x.done).length;
  const badge = document.getElementById('navTasks');
  if (badge) badge.textContent = open ? String(open) : '';
}
function setView(v) {
  // 'referat' is now part of the combined 'tasks' view — alias it, and once the
  // page is shown, reveal + scroll to the referat column so flashes land there.
  if (v === 'referat') {
    setView('tasks');
    const wrap = document.getElementById('refActive');
    if (wrap) {
      const col = wrap.closest('[data-col="referat"]') || wrap;
      requestAnimationFrame(() => col.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    return;
  }
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.dataset.view === v));
  if (v === 'designlab' && !labBuilt) renderDesignLab();
  if (v === 'kalender') renderKalender();
  if (v === 'hjem') renderHjem();
  scheduleSave();
}
function renderYear() { document.getElementById('yearLabel').textContent = String(state.year); }
function setYear(delta) { state.year += delta; renderYear(); renderGrid(); scheduleSave(); }

// =====================================================================
// SØK — command palette (Ctrl/Cmd+K). A top-anchored Spotlight-style
// overlay to find and jump to any contact, gjøremål or referat. Built
// once on first open and toggled thereafter (single instance → no
// stacked listeners). Activating a result closes the palette and jumps:
// contact → openContactDetail; task/referat → switch view + flash card.
// =====================================================================
let cmdk = null;            // the single palette instance { overlay, open, close, isOpen }

// fold accents/diacritics so "ø/å/é" match loosely, then lowercase.
function searchFold(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Build the full result list for a query. Empty query → []. Each result:
// { kind:'contact'|'task'|'ref', icon, title, ctx, run }.
function cmdkSearch(query) {
  const q = searchFold(query).trim();
  if (!q) return [];
  const PER_GROUP = 6;
  const groups = [];

  const matchContacts = state.contacts.filter(c => searchFold(c.initials).includes(q));
  const matchTasks = state.tasks.filter(t => searchFold(t.title).includes(q) || searchFold(t.note).includes(q));
  const matchRefs = state.referater.filter(r => searchFold(r.title).includes(q) || searchFold(r.note).includes(q));

  const ctxFor = (date, contactId) => {
    const bits = [];
    if (date) bits.push(fmtDate(date));
    const who = initialsFor(contactId);
    if (who) bits.push(who);
    return bits.join(' · ');
  };

  if (matchContacts.length) {
    groups.push({ label: 'Personer', total: matchContacts.length, items: matchContacts.slice(0, PER_GROUP).map(c => ({
      kind: 'contact', icon: 'user', title: c.initials, ctx: '',
      run: () => { cmdkClose(); openContactDetail(c.id); },
    })) });
  }
  if (matchTasks.length) {
    groups.push({ label: 'Gjøremål', total: matchTasks.length, items: matchTasks.slice(0, PER_GROUP).map(t => ({
      kind: 'task', icon: 'check-square', title: t.title, ctx: ctxFor(t.due, t.contactId),
      run: () => { cmdkClose(); setView('tasks'); flashItem(t.id); },
    })) });
  }
  if (matchRefs.length) {
    groups.push({ label: 'Referat', total: matchRefs.length, items: matchRefs.slice(0, PER_GROUP).map(r => ({
      kind: 'ref', icon: 'pen-line', title: r.title, ctx: ctxFor(r.date, r.contactId),
      run: () => { cmdkClose(); setView('referat'); flashItem(r.id); },
    })) });
  }
  return groups;
}

// Scroll to + briefly highlight the .item card with a given data-id. Runs on the
// next tick (lets the target view's render settle), then applies synchronously so
// it works even when rAF is throttled (e.g. a backgrounded window in tests).
function flashItem(id) {
  setTimeout(() => {
    const card = document.querySelector('.item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!card) return;
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    card.classList.remove('flash');
    void card.offsetWidth;       // restart the animation if already flashing
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1300);
  }, 0);
}

function buildCmdk() {
  const overlay = el('div', 'cmdk-overlay');
  const panel = el('div', 'cmdk');

  const top = el('div', 'cmdk-top');
  const sIc = el('span', 'cmdk-search-ic'); sIc.innerHTML = icon('search');
  const input = document.createElement('input');
  input.className = 'field cmdk-input'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
  input.placeholder = 'Søk etter person, gjøremål eller referat…';
  input.setAttribute('aria-label', 'Søk');
  top.append(sIc, input);

  const results = el('div', 'cmdk-results');

  const hint = el('div', 'cmdk-hint');
  const mkKey = (label) => el('kbd', 'cmdk-kbd', label);
  const seg = (keys, txt) => { const s = el('span', 'cmdk-hint-seg'); keys.forEach(k => s.appendChild(mkKey(k))); s.appendChild(el('span', 'cmdk-hint-txt', txt)); return s; };
  hint.append(seg(['↑', '↓'], 'flytt'), seg(['↵'], 'åpne'), seg(['Esc'], 'lukke'));

  panel.append(top, results, hint);
  overlay.appendChild(panel);

  // flat list of selectable rows, with their result objects, for kb nav.
  let flat = [];
  let active = -1;

  const setActive = (i) => {
    if (!flat.length) { active = -1; return; }
    active = (i + flat.length) % flat.length;
    flat.forEach((f, idx) => f.row.classList.toggle('active', idx === active));
    const row = flat[active].row;
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  };

  const renderResults = () => {
    results.textContent = '';
    flat = [];
    const q = input.value;
    if (!q.trim()) {
      results.appendChild(el('div', 'cmdk-empty', 'Skriv for å søke i personer, gjøremål og referat.'));
      active = -1;
      return;
    }
    const groups = cmdkSearch(q);
    if (!groups.length) {
      results.appendChild(el('div', 'cmdk-empty', 'Ingen treff'));
      active = -1;
      return;
    }
    groups.forEach(g => {
      results.appendChild(el('div', 'cmdk-group-label', g.label));
      g.items.forEach(it => {
        const row = el('div', 'cmdk-item');
        row.setAttribute('role', 'option');
        const ic = el('span', 'cmdk-item-ic'); ic.innerHTML = icon(it.icon);
        const txt = el('div', 'cmdk-item-text');
        txt.appendChild(el('span', 'cmdk-item-title', it.title));
        if (it.ctx) txt.appendChild(el('span', 'cmdk-item-ctx', it.ctx));
        row.append(ic, txt);
        const myIndex = flat.length;
        row.addEventListener('mousemove', () => setActive(myIndex));
        row.addEventListener('click', () => it.run());
        results.appendChild(row);
        flat.push({ row, result: it });
      });
      if (g.total > g.items.length) {
        results.appendChild(el('div', 'cmdk-more', '+' + (g.total - g.items.length) + ' flere'));
      }
    });
    setActive(0);
  };

  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && flat[active]) flat[active].result.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); cmdkClose(); }
  });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cmdkClose(); });

  return {
    overlay, input,
    reset() { input.value = ''; renderResults(); },
    focus() { input.focus(); input.select(); },
  };
}

function cmdkOpen() {
  if (!cmdk) cmdk = buildCmdk();
  if (cmdk.overlay.isConnected) { cmdk.focus(); return; }
  modalMount.appendChild(cmdk.overlay);
  cmdk.reset();
  // focus after mount so the input is reliably focusable
  requestAnimationFrame(() => cmdk.focus());
}
function cmdkClose() {
  if (cmdk && cmdk.overlay.isConnected) cmdk.overlay.remove();
}
function cmdkToggle() { (cmdk && cmdk.overlay.isConnected) ? cmdkClose() : cmdkOpen(); }

// single global shortcut listener (bound once in bind()).
function bindCmdkShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      cmdkToggle();
    }
  });
}

// =====================================================================
// wiring
// =====================================================================
function bind() {
  document.querySelectorAll('.nav-item').forEach(n => n.addEventListener('click', () => setView(n.dataset.nav)));
  bindCmdkShortcut();
  const searchBtn = document.getElementById('cmdkTrigger');
  if (searchBtn) searchBtn.addEventListener('click', cmdkOpen);

  const contactItems = () => state.contacts.map(c => ({ value: c.id, label: c.initials }));
  taskContactCombo = buildCombo(document.getElementById('taskContactCombo'), { getItems: contactItems });
  refContactCombo = buildCombo(document.getElementById('refContactCombo'), { getItems: contactItems });
  taskPriorityDd = buildDropdown(document.getElementById('taskPriorityDd'), {
    value: state.settings.defaultPriority || 'normal',
    items: [{ value: 'low', label: 'Lav' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Høy' }],
  });
  taskDuePicker = buildDatePicker(document.getElementById('taskDue'), { value: defaultDueDate(), placeholder: 'Velg dato' });
  refDatePicker = buildDatePicker(document.getElementById('refDate'), { value: todayStr(), placeholder: 'Velg dato' });

  document.getElementById('addContactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('contactInput');
    addContact(inp.value); inp.value = ''; inp.focus();
  });

  document.getElementById('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;
    const contactId = resolveContact(taskContactCombo.value);
    const id = uid();
    state.tasks.push({
      id, title,
      note: document.getElementById('taskNote').value.trim(),
      due: taskDuePicker.value || '',
      priority: taskPriorityDd.value || 'normal',
      contactId, done: false, createdAt: Date.now(), doneAt: null,
    });
    pendingEnterId = id; // animate the new task in
    e.target.reset(); taskContactCombo.clear();
    taskPriorityDd.value = state.settings.defaultPriority || 'normal';
    taskDuePicker.value = defaultDueDate();
    renderTasks(); document.getElementById('taskTitle').focus(); scheduleSave();
  });

  document.getElementById('addReferatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('refTitle').value.trim();
    if (!title) return;
    const contactId = resolveContact(refContactCombo.value);
    const id = uid();
    state.referater.push({
      id, title,
      note: document.getElementById('refNote').value.trim(),
      date: refDatePicker.value || '',
      contactId, done: false, createdAt: Date.now(), doneAt: null,
    });
    pendingEnterId = id;
    e.target.reset(); refContactCombo.clear(); refDatePicker.value = todayStr();
    renderReferat(); document.getElementById('refTitle').focus(); scheduleSave();
  });

  const sum = document.getElementById('summary');
  sum.addEventListener('input', () => { state.summary = sum.value; scheduleSave(); });

  document.getElementById('yearPrev').addEventListener('click', () => setYear(-1));
  document.getElementById('yearNext').addEventListener('click', () => setYear(1));

  bindQuickNote();
  bindSettings();
}

// =====================================================================
// settings: apply (CSS vars + zoom) — unchanged contract; extended for tokens
// =====================================================================
// Auto ("Standard") input-field fill for theme `t`: a colour that CLEARLY
// stands out from both the window (--bg) and the card surface (panel) so fields
// never blend into the panel. Mirrors the surface maths in applySettings.
//   dark  → a touch lighter than the panel (+ a faint accent tint)
//   light → pull the panel back toward the darker window bg (+ faint accent tint)
//           so the field reads as a distinct, slightly recessed inset.
// Returns a concrete #rrggbb so the colour picker can open on it.
function deriveFieldBg(t) {
  const accentNow = state.settings.accent || t.accent;
  const dark = hexLuminance(t.bg) < 0.5;
  const s1 = t.panel;
  return dark
    ? mixHex(mixHex(s1, '#ffffff', 0.09), accentNow, 0.06)
    : mixHex(mixHex(s1, t.bg, 0.45), accentNow, 0.05);
}

function applySettings() {
  const st = state.settings, root = document.documentElement.style;
  const t = allThemes()[st.theme] || THEMES.lys;
  root.setProperty('--bg', t.bg);
  root.setProperty('--panel', t.panel);
  root.setProperty('--ink', t.ink);
  root.setProperty('--muted', t.muted);
  root.setProperty('--faint', t.faint);
  root.setProperty('--line', t.line);
  root.setProperty('--line-strong', t.lineStrong);
  root.setProperty('--shadow', t.shadow);
  root.setProperty('--accent', st.accent || t.accent);
  // text colour on a filled accent: white normally, near-black when accent is light
  const lightAccent = !st.accent && DARK_ON_ACCENT.has(st.theme);
  root.setProperty('--on-accent', lightAccent ? '#0c1418' : '#ffffff');
  // elevation ladder tuning — per theme (dark lifts harder, light gently).
  // --surface-lift remains the FALLBACK knob, but surfaces are now theme-driven
  // (below) so a custom theme can carry an explicit card surface.
  root.setProperty('--surface-lift', (t.lift != null ? t.lift : 5) + '%');
  // Surfaces are now driven by the theme's `panel` (the card/pane colour), so
  // each theme — built-in OR custom — can carry an explicit, distinct card
  // surface that floats off the window --bg. surface-1 = panel; surface-2/3 are
  // gentle steps further from the bg (toward white on light themes, toward a
  // lighter panel on dark) so the elevation ladder still reads. This replaces
  // the old estetisk-only CSS override with a general mechanism.
  const dark = hexLuminance(t.bg) < 0.5;
  const s1 = t.panel;
  const s2 = dark ? mixHex(s1, '#ffffff', 0.05) : mixHex(s1, '#ffffff', 0.5);
  const s3 = dark ? mixHex(s1, '#ffffff', 0.09) : '#ffffff';
  root.setProperty('--surface-1', s1);
  root.setProperty('--surface-2', s2);
  root.setProperty('--surface-3', s3);
  // input-field background (--field-bg). Explicit user colour wins; otherwise
  // derive a fill that CLEARLY stands out from both the window (--bg) and the
  // card surface (s1 / surface-1) so fields never disappear into the panel.
  //   dark  → a touch lighter than the panel (lifts off the dark card)
  //   light → pull the panel back toward the (darker) window bg + a faint accent
  //           tint, so the field reads as a distinct, slightly recessed inset
  //           against the near-white card. Stays well clear of --bg too.
  root.setProperty('--field-bg', st.fieldColor || deriveFieldBg(t));
  const f = FONTS.find(x => x.key === st.font) || FONTS[0];
  root.setProperty('--font', f.stack);
  // heading font: explicit override wins, else the theme's "vibe" head font
  // (Aesthetic = serif). If the user has explicitly chosen a serif body font,
  // headings inherit it too.
  let headStack;
  if (st.headingFont === 'sans') headStack = HEAD_SANS;
  else if (st.headingFont === 'serif') headStack = HEAD_SERIF;
  else headStack = (st.font === 'serif') ? f.stack : (t.head || HEAD_SANS); // 'auto'
  root.setProperty('--font-head', headStack);
  const r = clamp(st.radius, 0, 22);
  root.setProperty('--r', r + 'px');
  root.setProperty('--r-sm', Math.max(2, Math.round(r * 0.62)) + 'px');
  root.setProperty('--r-xs', Math.max(2, Math.round(r * 0.45)) + 'px');
  const rs = clamp(st.readingSize, 12, 18);
  root.setProperty('--text-size', rs + 'px');
  // scale the whole type ramp off the reading size (base 14px) so it actually
  // changes text everywhere — the --fs-* tokens multiply by this.
  root.setProperty('--fs-mult', (rs / 14).toFixed(4));
  document.documentElement.style.zoom = String(clamp(st.scale, 85, 130) / 100);
  document.documentElement.dataset.theme = st.theme;   // lets CSS scope per-theme touches
  document.documentElement.dataset.density = st.density;
  document.documentElement.dataset.contacted = st.contacted;
  document.documentElement.dataset.btnStyle = st.btnStyle;  // live app-wide primary-button style
  document.documentElement.dataset.fieldStyle = st.fieldStyle;  // live app-wide form-field style
  document.documentElement.dataset.ddStyle = st.ddStyle;  // live app-wide dropdown-menu style
  // background gradient intensity (drives the sidebar + window gradient)
  root.setProperty('--grad-strength', clamp(st.gradientStrength, 0, 14) + '%');
  // motion preference: 'full' | 'redusert' | 'av' (CSS scopes off this)
  document.documentElement.dataset.motion = st.motion;

  document.body.dataset.bg = st.background;
}

// settings controls (built with the new components, native-free)
let densitySeg, bgSeg, contactedSeg, readingSlider, scaleSlider, radiusSlider, accentWell, fieldWell, gradientSlider;

// Innstillinger: categorized two-column layout (left menu + right pane).
let settingsCategory = 'tema';
const SETTINGS_CATS = [
  { key: 'tema',     label: 'Tema',             icon: 'palette' },
  { key: 'utseende', label: 'Utseende',         icon: 'settings' },
  { key: 'tekst',    label: 'Tekst & størrelse', icon: 'edit' },
  { key: 'atferd',   label: 'Atferd',           icon: 'check-square' },
  { key: 'backup',   label: 'Sikkerhetskopi',   icon: 'download' },
  { key: 'oppdater', label: 'Oppdateringer',    icon: 'rotate-ccw' },
  { key: 'reset',    label: 'Tilbakestill',     icon: 'rotate-ccw' },
];
// build the left category menu + show only the active category's pane
function renderSetCatNav() {
  const nav = document.getElementById('setCatNav');
  if (!nav) return;
  if (!SETTINGS_CATS.some(c => c.key === settingsCategory)) settingsCategory = 'tema';
  nav.textContent = '';
  SETTINGS_CATS.forEach(c => {
    const item = el('button', 'set-catnav-item' + (c.key === settingsCategory ? ' active' : ''));
    item.type = 'button';
    const ic = el('span', 'ic'); ic.innerHTML = icon(c.icon); item.appendChild(ic);
    item.appendChild(el('span', null, c.label));
    item.addEventListener('click', () => {
      if (settingsCategory === c.key) return;
      settingsCategory = c.key;
      renderSetCatNav();
    });
    nav.appendChild(item);
  });
  document.querySelectorAll('.set-pane').forEach(p => p.classList.toggle('active', p.dataset.cat === settingsCategory));
}

function renderSettings() {
  renderSetCatNav();
  const st = state.settings;
  const themes = allThemes();
  const t = themes[st.theme] || THEMES.lys;

  const tg = document.getElementById('themeGrid');
  tg.textContent = '';
  Object.entries(themes).forEach(([key, th]) => {
    const card = el('button', 'theme-card' + (key === st.theme ? ' active' : '') + (th.custom ? ' custom' : '')); card.type = 'button';
    const prev = el('div', 'theme-prev'); prev.style.background = th.bg;
    const bar = el('div', 'tp-bar'); bar.style.background = th.panel; bar.style.borderRight = '1px solid ' + th.line;
    const p1 = el('div', 'tp-panel'); p1.style.background = th.lineStrong;
    const p2 = el('div', 'tp-panel b'); p2.style.background = th.line;
    const dot = el('div', 'tp-dot'); dot.style.background = th.accent;
    prev.append(bar, p1, p2, dot);
    card.append(prev, el('div', 'theme-name', th.name));
    card.addEventListener('click', () => {
      // apply the theme as a full "vibe" bundle: colours + heading/body font +
      // radius + accent. The user can still override any of these afterward via
      // the controls below (which just rewrite st.font / st.radius / st.accent).
      st.theme = key;
      st.accent = '';                                   // → theme's default accent
      if (th.font) st.font = th.font;                   // theme's body/heading vibe
      if (Number.isFinite(th.radius)) st.radius = th.radius;
      applySettings(); renderSettings(); refreshDesignLab(); scheduleSave();
    });
    // custom themes get hover edit/delete affordances (built-ins stay clean)
    if (th.custom) {
      const tools = el('div', 'theme-tools');
      const edit = el('button', 'theme-tool'); edit.type = 'button'; edit.dataset.tip = 'Rediger';
      edit.innerHTML = icon('pen-line');
      edit.addEventListener('click', (e) => { e.stopPropagation(); openThemeBuilder(th); });
      const del = el('button', 'theme-tool'); del.type = 'button'; del.dataset.tip = 'Slett';
      del.innerHTML = icon('x');
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteCustomTheme(th); });
      tools.append(edit, del);
      card.appendChild(tools);
    }
    tg.appendChild(card);
  });

  // "+ Lag eget tema" — opens the builder for a brand-new theme
  const addCard = el('button', 'theme-card theme-add'); addCard.type = 'button';
  const addInner = el('div', 'theme-add-inner');
  const plus = el('span', 'ic'); plus.innerHTML = icon('plus'); addInner.appendChild(plus);
  addInner.appendChild(el('span', null, 'Lag eget tema'));
  addCard.appendChild(addInner);
  addCard.addEventListener('click', () => openThemeBuilder(null));
  tg.appendChild(addCard);

  // accent: custom colour well (opens live picker) + quick swatches + default
  const eff = (st.accent || t.accent).toLowerCase();
  const isDefault = !st.accent;
  const accentHost = document.getElementById('accentColor');
  accentWell = buildColorWell(accentHost, {
    value: eff,
    onLive: (hex) => { st.accent = hex; applySettings(); refreshDesignLab(); scheduleSave(); }, // live, no re-render mid-drag
    onDefault: () => { st.accent = ''; applySettings(); refreshDesignLab(); },
    onClose: () => { renderSettings(); refreshDesignLab(); scheduleSave(); },
  });
  const sw = document.getElementById('accentSwatches'); sw.textContent = '';
  // "Standard" = back to the theme's own accent (no custom override)
  const defSw = el('button', 'swatch swatch-default' + (isDefault ? ' active' : '')); defSw.type = 'button';
  defSw.dataset.tip = 'Standard (temaets farge)'; defSw.style.background = t.accent;
  defSw.addEventListener('click', () => { st.accent = ''; applySettings(); renderSettings(); refreshDesignLab(); scheduleSave(); });
  sw.appendChild(defSw);
  ACCENTS.forEach(hex => {
    const b = el('button', 'swatch' + (!isDefault && hex.toLowerCase() === eff ? ' active' : '')); b.type = 'button';
    b.dataset.hex = hex; b.dataset.tip = hex; b.style.background = hex;
    b.addEventListener('click', () => { st.accent = hex; applySettings(); renderSettings(); refreshDesignLab(); scheduleSave(); });
    sw.appendChild(b);
  });

  // felt-farge: same pattern as Aksentfarge — a live colour well + a "Standard"
  // reset swatch (back to the auto, stand-out fill derived in applySettings).
  const fcDefault = !st.fieldColor;
  const autoFieldBg = deriveFieldBg(t);   // concrete hex the picker can open on
  const fcEff = (st.fieldColor || autoFieldBg).toLowerCase();
  const fieldHost = document.getElementById('fieldColor');
  fieldWell = buildColorWell(fieldHost, {
    value: fcEff,
    tip: 'Velg felt-farge',
    onLive: (hex) => { st.fieldColor = hex; applySettings(); refreshDesignLab(); scheduleSave(); },
    onDefault: () => { st.fieldColor = ''; applySettings(); refreshDesignLab(); },
    onClose: () => { renderSettings(); refreshDesignLab(); scheduleSave(); },
  });
  const fcsw = document.getElementById('fieldColorSwatches'); fcsw.textContent = '';
  const fcDefSw = el('button', 'swatch swatch-default' + (fcDefault ? ' active' : '')); fcDefSw.type = 'button';
  fcDefSw.dataset.tip = 'Standard (skiller seg fra bakgrunnen)'; fcDefSw.style.background = autoFieldBg;
  fcDefSw.addEventListener('click', () => { st.fieldColor = ''; applySettings(); renderSettings(); refreshDesignLab(); scheduleSave(); });
  fcsw.appendChild(fcDefSw);

  buildThemePreview();

  const fg = document.getElementById('fontGrid'); fg.textContent = '';
  FONTS.forEach(f => {
    const c = el('button', 'font-card' + (f.key === st.font ? ' active' : '')); c.type = 'button';
    c.style.fontFamily = f.stack;
    c.append(el('span', null, f.label), el('small', null, 'Aa Bb 123'));
    c.addEventListener('click', () => { st.font = f.key; applySettings(); renderSettings(); scheduleSave(); });
    fg.appendChild(c);
  });

  // sliders (custom)
  const readHost = document.getElementById('readingRange'); readHost.textContent = '';
  readingSlider = buildSlider({ min: 12, max: 18, step: 1, value: st.readingSize, onInput: (v) => {
    st.readingSize = clamp(v, 12, 18); document.getElementById('readingVal').textContent = st.readingSize + 'px'; applySettings(); scheduleSave();
  } });
  readHost.appendChild(readingSlider.el);
  document.getElementById('readingVal').textContent = st.readingSize + 'px';

  const scaleHost = document.getElementById('scaleRange'); scaleHost.textContent = '';
  // Scale zooms the whole UI, so applying it live mid-drag makes the slider jump
  // under the cursor. Update only the label while dragging; apply zoom on release.
  scaleSlider = buildSlider({ min: 85, max: 130, step: 5, value: st.scale,
    onInput: (v) => { document.getElementById('scaleVal').textContent = clamp(v, 85, 130) + '%'; },
    onChange: (v) => { st.scale = clamp(v, 85, 130); document.getElementById('scaleVal').textContent = st.scale + '%'; applySettings(); scheduleSave(); },
  });
  scaleHost.appendChild(scaleSlider.el);
  document.getElementById('scaleVal').textContent = st.scale + '%';

  const radiusHost = document.getElementById('radiusRange'); radiusHost.textContent = '';
  radiusSlider = buildSlider({ min: 0, max: 22, step: 1, value: st.radius, onInput: (v) => {
    st.radius = clamp(v, 0, 22); document.getElementById('radiusVal').textContent = st.radius + 'px'; applySettings(); scheduleSave();
  } });
  radiusHost.appendChild(radiusSlider.el);
  document.getElementById('radiusVal').textContent = st.radius + 'px';

  // gradient strength slider (Utseende → Bakgrunn). Live on drag.
  const gradHost = document.getElementById('gradientRange'); gradHost.textContent = '';
  gradientSlider = buildSlider({ min: 0, max: 14, step: 1, value: st.gradientStrength, onInput: (v) => {
    st.gradientStrength = clamp(v, 0, 14); document.getElementById('gradientVal').textContent = st.gradientStrength + '%'; applySettings(); scheduleSave();
  } });
  gradHost.appendChild(gradientSlider.el);
  document.getElementById('gradientVal').textContent = st.gradientStrength + '%';

  // segmented controls
  mountSeg('densityGroup', st.density);
  mountSeg('bgGroup', st.background);
  mountSeg('contactedGroup', st.contacted);

  // ---- new appearance controls (Utseende) ----
  // Overskrift-font: følg tema / Sans / Serif (component-built segmented)
  const headHost = document.getElementById('headingFontGroup'); headHost.textContent = '';
  const headSeg = buildSegmented({
    value: st.headingFont,
    items: [{ value: 'auto', label: 'Følg tema' }, { value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }],
    onChange: (v) => { st.headingFont = v; applySettings(); scheduleSave(); },
  });
  headHost.appendChild(headSeg.el);

  // Animasjoner: full / redusert / av
  const motionHost = document.getElementById('motionGroup'); motionHost.textContent = '';
  const motionSeg = buildSegmented({
    value: st.motion,
    items: [{ value: 'full', label: 'Full' }, { value: 'redusert', label: 'Redusert' }, { value: 'av', label: 'Av' }],
    onChange: (v) => { st.motion = v; applySettings(); scheduleSave(); },
  });
  motionHost.appendChild(motionSeg.el);

  // ---- new behavioral controls (Atferd) ----
  const landingHost = document.getElementById('landingViewDd'); landingHost.textContent = '';
  buildDropdown(landingHost, {
    value: st.landingView,
    items: [
      { value: 'hjem', label: 'Hjem' }, { value: 'oversikt', label: 'Oversikt' },
      { value: 'tasks', label: 'Gjøremål' }, { value: 'referat', label: 'Referat' },
      { value: 'kalender', label: 'Kalender' },
    ],
    onChange: (v) => { st.landingView = v; scheduleSave(); },
  });

  const prioHost = document.getElementById('defaultPriorityDd'); prioHost.textContent = '';
  buildDropdown(prioHost, {
    value: st.defaultPriority,
    items: [{ value: 'low', label: 'Lav' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Høy' }],
    onChange: (v) => { st.defaultPriority = v; if (taskPriorityDd) taskPriorityDd.value = v; scheduleSave(); },
  });

  const dueHost = document.getElementById('defaultDueGroup'); dueHost.textContent = '';
  const dueSeg = buildSegmented({
    value: st.defaultDue,
    items: [{ value: 'today', label: 'I dag' }, { value: 'tomorrow', label: 'I morgen' }, { value: 'none', label: 'Ingen' }],
    onChange: (v) => { st.defaultDue = v; if (taskDuePicker) taskDuePicker.value = defaultDueDate(); scheduleSave(); },
  });
  dueHost.appendChild(dueSeg.el);

  const dfHost = document.getElementById('dateFormatGroup'); dfHost.textContent = '';
  const dfSeg = buildSegmented({
    value: st.dateFormat,
    items: [{ value: 'lang', label: 'Lang (18. juni 2026)' }, { value: 'numerisk', label: 'Numerisk (18.06.2026)' }],
    onChange: (v) => {
      st.dateFormat = v;
      // dates appear app-wide; re-render the data views so chips/agenda update now.
      renderGrid(); renderTasks(); renderReferat(); renderKalender(); renderHjem();
      buildThemePreview();
      scheduleSave();
    },
  });
  dfHost.appendChild(dfSeg.el);
}

// Live preview card for the Tema category — reflects the CURRENT applied
// settings (applySettings restyles everything live, so this updates instantly
// when a theme/accent is picked). Token-driven; no inline colours.
function buildThemePreview() {
  const host = document.getElementById('themePreview');
  if (!host) return;
  host.textContent = '';
  // window-bg "stage" so the card visibly floats on the background
  const stage = el('div', 'tprev-stage');
  const card = el('div', 'tprev-card');
  card.appendChild(el('div', 'tprev-head', 'Forhåndsvisning'));
  card.appendChild(el('div', 'tprev-body', 'Slik ser overskrift, tekst, knapper, merker og felt ut med valgt tema.'));
  // row 1: primary button + chips + contacted cell
  const row = el('div', 'tprev-row');
  row.appendChild(button({ label: 'Knapp', variant: 'primary', icon: 'check' }));
  const chip1 = el('span', 'chip person'); { const i = el('span', 'ic'); i.innerHTML = icon('user'); chip1.append(i, el('span', null, 'AB')); }
  const chip2 = el('span', 'chip due'); chip2.textContent = fmtDate(todayStr());
  const cell = el('span', 'tprev-cell on'); cell.innerHTML = CHECK_SVG;
  row.append(chip1, chip2, cell);
  card.appendChild(row);
  // row 2: a real input field (token-driven, follows the field style)
  const row2 = el('div', 'tprev-row');
  const field = document.createElement('input');
  field.className = 'field'; field.type = 'text'; field.placeholder = 'Søk…';
  field.tabIndex = -1; field.readOnly = true;
  row2.appendChild(field);
  card.appendChild(row2);
  stage.appendChild(card);
  host.appendChild(stage);
}

// =====================================================================
// CUSTOM THEME BUILDER — "Lag eget tema"
// =====================================================================
// Derive a full 11-field vibe bundle from just 3 chosen colours (bg/ink/accent)
// plus a heading-font choice and a radius. Light vs dark is read off the bg
// luminance; the rest of the palette is mixed from ink↔bg so it stays coherent.
function deriveTheme({ bg, flate, ink, accent, serif, radius }) {
  const dark = hexLuminance(bg) < 0.5;
  const white = '#ffffff';
  // The card surface ("Flate") is now an EXPLICIT colour the user picks, so the
  // window bg and the cards can differ deliberately. Fall back to a derived
  // lift off bg only if no flate is provided (older callers / safety).
  const panel = (flate && HEX6.test(flate)) ? flate
    : (dark ? mixHex(bg, white, 0.07) : mixHex(bg, white, 0.55));
  return {
    bg,
    panel,
    ink,
    muted: mixHex(bg, ink, 0.52),
    faint: mixHex(bg, ink, 0.32),
    line: mixHex(bg, ink, 0.12),
    lineStrong: mixHex(bg, ink, 0.20),
    accent,
    shadow: dark ? SHADOW_DARK : SHADOW_LIGHT,
    head: serif ? HEAD_SERIF : HEAD_SANS,
    font: serif ? 'serif' : 'system',
    radius: clamp(radius, 0, 22),
    lift: dark ? 7 : 4.5,
  };
}

// A small live sample card that mirrors the look of buildThemePreview but is
// driven by an explicit palette (so the modal can preview before saving).
function renderThemeSample(host, th) {
  host.textContent = '';
  host.className = 'tb-sample';
  // the OUTER host is the window background; the inner card uses the panel
  // (Flate) colour — so the bg-vs-card separation is obvious at a glance.
  host.style.background = th.bg;
  host.style.color = th.ink;
  host.style.border = '1px solid ' + th.line;
  const rad = clamp(th.radius, 0, 22);
  const radSm = Math.max(2, Math.round(rad * 0.62));
  const onAccent = hexLuminance(th.accent) > 0.62 ? '#0c1418' : '#ffffff';

  const card = el('div', 'tb-sample-card');
  card.style.background = th.panel;
  card.style.border = '1px solid ' + th.line;
  card.style.borderRadius = rad + 'px';

  const head = el('div', 'tb-sample-head', 'Forhåndsvisning');
  head.style.fontFamily = th.head; head.style.color = th.ink;
  const body = el('div', 'tb-sample-body', 'Slik ser overskrift, tekst, knapper, merker og felt ut med temaet.');
  body.style.color = th.muted;

  // row 1: primary button + two chips
  const row = el('div', 'tb-sample-row');
  const btn = el('span', 'tb-sample-btn', 'Knapp');
  btn.style.background = th.accent; btn.style.color = onAccent;
  btn.style.borderRadius = radSm + 'px';
  const chip1 = el('span', 'tb-sample-chip', 'AB');
  chip1.style.background = th.lineStrong; chip1.style.color = th.ink;
  const chip2 = el('span', 'tb-sample-chip', 'Frist');
  chip2.style.background = mixHex(th.accent, th.panel, 0.78); chip2.style.color = th.accent;
  const dot = el('span', 'tb-sample-dot'); dot.style.background = th.accent;
  row.append(btn, chip1, chip2, dot);

  // row 2: an input field + a sample contacted cell
  const row2 = el('div', 'tb-sample-row');
  const field = el('div', 'tb-sample-field', 'Søk…');
  field.style.background = th.panel; field.style.color = th.muted;
  field.style.border = '1px solid ' + th.lineStrong; field.style.borderRadius = radSm + 'px';
  const cell = el('span', 'tb-sample-cell');
  cell.style.background = mixHex('#16a34a', th.panel, 0.78); cell.style.color = '#16a34a';
  cell.style.borderRadius = Math.max(2, Math.round(rad * 0.45)) + 'px';
  cell.innerHTML = CHECK_SVG;
  row2.append(field, cell);

  card.append(head, body, row, row2);
  host.appendChild(card);
}

// Open the builder. `existing` = the custom theme object to edit, or null for new.
function openThemeBuilder(existing) {
  const editing = !!existing;
  // working values — seed from existing (edit) or sane defaults (new)
  let name = editing ? existing.name : '';
  let bg = editing ? existing.bg : '#eceef2';
  // Flate = the card/surface colour, picked separately from the window bg.
  let flate = editing ? (existing.panel || '#ffffff') : '#ffffff';
  let ink = editing ? existing.ink : '#1b2230';
  let accent = editing ? existing.accent : '#4f46e5';
  let serif = editing ? existing.head === HEAD_SERIF : false;
  let radius = editing && Number.isFinite(existing.radius) ? existing.radius : 12;

  const body = el('div', 'tb');

  // Navn
  const nameField = el('div', 'tb-field');
  nameField.appendChild(el('label', 'tb-label', 'Navn'));
  const nameInput = document.createElement('input');
  nameInput.className = 'field'; nameInput.type = 'text'; nameInput.maxLength = 40;
  nameInput.placeholder = 'Mitt tema'; nameInput.value = name;
  nameField.appendChild(nameInput);
  body.appendChild(nameField);

  // sample (declared early so colour wells can repaint it live)
  const sample = el('div');
  const repaint = () => renderThemeSample(sample, deriveTheme({ bg, flate, ink, accent, serif, radius }));

  // four colour wells: window Bakgrunn + card Flate + Tekst + Aksent
  const colorsRow = el('div', 'tb-colors');
  const mkWell = (label, get, set) => {
    const f = el('div', 'tb-field tb-colorfield');
    f.appendChild(el('label', 'tb-label', label));
    const host = el('div');
    f.appendChild(host);
    buildColorWell(host, {
      value: get(),
      onLive: (hex) => { set(hex); repaint(); },
      onClose: () => { repaint(); },
    });
    return f;
  };
  colorsRow.append(
    mkWell('Bakgrunn', () => bg, (v) => bg = v),
    mkWell('Flate', () => flate, (v) => flate = v),
    mkWell('Tekst', () => ink, (v) => ink = v),
    mkWell('Aksent', () => accent, (v) => accent = v),
  );
  body.appendChild(colorsRow);

  // heading font: Sans / Serif segmented
  const headField = el('div', 'tb-field');
  headField.appendChild(el('label', 'tb-label', 'Overskrift'));
  const headSeg = buildSegmented({
    value: serif ? 'serif' : 'sans',
    items: [{ value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' }],
    onChange: (v) => { serif = (v === 'serif'); repaint(); },
  });
  headField.appendChild(headSeg.el);
  body.appendChild(headField);

  // radius slider
  const radField = el('div', 'tb-field');
  const radLabRow = el('div', 'tb-label-row');
  radLabRow.appendChild(el('label', 'tb-label', 'Hjørner'));
  const radVal = el('span', 'tb-val', radius + 'px');
  radLabRow.appendChild(radVal);
  radField.appendChild(radLabRow);
  const radSlider = buildSlider({ min: 0, max: 22, step: 1, value: radius, onInput: (v) => {
    radius = clamp(v, 0, 22); radVal.textContent = radius + 'px'; repaint();
  } });
  radField.appendChild(radSlider.el);
  body.appendChild(radField);

  // live preview
  const prevField = el('div', 'tb-field');
  prevField.appendChild(el('label', 'tb-label', 'Forhåndsvisning'));
  prevField.appendChild(sample);
  body.appendChild(prevField);
  repaint();

  // footer
  const foot = el('div', 'lab-row');
  const cancel = button({ label: 'Avbryt', variant: 'ghost' });
  const save = button({ label: 'Lagre', variant: 'primary', icon: 'check' });
  foot.append(cancel, save);

  const m = openModal({ title: editing ? 'Rediger tema' : 'Lag eget tema', bodyNode: body, footNode: foot, width: 440 });

  cancel.addEventListener('click', () => {
    m.close();
    applySettings();   // revert any live colour-well preview that leaked to the app
  });

  save.addEventListener('click', () => {
    const finalName = (nameInput.value.trim() || 'Eget tema').slice(0, 40);
    const palette = deriveTheme({ bg, flate, ink, accent, serif, radius });
    if (editing) {
      // update in place
      const i = state.customThemes.findIndex(x => x.key === existing.key);
      const merged = sanitizeCustomTheme({ ...palette, key: existing.key, name: finalName, custom: true });
      if (i >= 0 && merged) state.customThemes[i] = merged;
    } else {
      const key = 'egen-' + uid();
      const created = sanitizeCustomTheme({ ...palette, key, name: finalName, custom: true });
      if (created) {
        state.customThemes.push(created);
        // select the new theme as a full vibe bundle
        state.settings.theme = key;
        state.settings.accent = '';
        state.settings.font = created.font;
        state.settings.radius = created.radius;
      }
    }
    m.close();
    applySettings(); renderSettings(); refreshDesignLab(); scheduleSave();
  });
}

function deleteCustomTheme(th) {
  confirmModal({
    title: 'Slett tema?', body: `Vil du slette «${th.name}»?`, confirmLabel: 'Slett', danger: true,
    onConfirm: () => {
      state.customThemes = state.customThemes.filter(x => x.key !== th.key);
      if (state.settings.theme === th.key) {
        // active theme was deleted → fall back to the default built-in
        state.settings.theme = 'lys';
        state.settings.accent = '';
      }
      applySettings(); renderSettings(); refreshDesignLab(); scheduleSave();
    },
  });
}

// the segmented groups are authored as static HTML buttons; wire + sync them.
function mountSeg(id, val) {
  const g = document.getElementById(id); if (!g) return;
  g.querySelectorAll('.seg').forEach(b => b.classList.toggle('on', b.dataset.val === val));
}
function wireSeg(id, key) {
  const g = document.getElementById(id); if (!g) return;
  g.querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => {
    state.settings[key] = b.dataset.val; applySettings(); mountSeg(id, b.dataset.val); scheduleSave();
  }));
}

function bindSettings() {
  wireSeg('densityGroup', 'density');
  wireSeg('bgGroup', 'background');
  wireSeg('contactedGroup', 'contacted');

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const ok = await window.api.exportBackup(state);
    if (ok) { saveStateEl.textContent = 'Eksportert'; setTimeout(() => saveStateEl.textContent = '', 1500); }
  });
  document.getElementById('importBtn').addEventListener('click', async () => {
    const incoming = await window.api.importBackup();
    if (!incoming) return;
    confirmModal({
      title: 'Importere data?', body: 'Dette erstatter alt som ligger her nå.', confirmLabel: 'Importer', danger: true,
      onConfirm: async () => {
        state = normalize(incoming); renderAll(); await window.api.save(state);
        saveStateEl.textContent = 'Importert'; setTimeout(() => saveStateEl.textContent = '', 1500);
      },
    });
  });
  const reveal = document.getElementById('revealBtn');
  if (reveal && window.api.revealData) reveal.addEventListener('click', () => window.api.revealData());

  document.getElementById('resetTheme').addEventListener('click', () => {
    // full reset: every setting (appearance + behavioral) back to defaults.
    state.settings = defaultSettings();
    // keep the task add-form controls in sync with the reset behavioral defaults
    if (taskPriorityDd) taskPriorityDd.value = state.settings.defaultPriority;
    if (taskDuePicker) taskDuePicker.value = defaultDueDate();
    applySettings(); renderSettings(); refreshDesignLab();
    // dateFormat may have changed → refresh data views so dates re-render
    renderGrid(); renderTasks(); renderReferat(); renderKalender(); renderHjem();
    scheduleSave();
  });
}

// =====================================================================
// DESIGN LAB — the component + token gallery (source of truth)
// =====================================================================
let labBuilt = false;
let labCategory = 'knapper';  // which Komponent-lab category is shown
function refreshDesignLab() { if (labBuilt) renderDesignLab(); }

function labSection(title, desc) {
  const s = el('div', 'lab-section');
  s.appendChild(el('h2', null, title));
  if (desc) s.appendChild(el('p', 'lab-desc', desc));
  return s;
}
function labCell(label, node) {
  const c = el('div', 'lab-cell');
  if (label) c.appendChild(el('div', 'lab-label', label));
  c.appendChild(node);
  return c;
}
function labRow(...nodes) { const r = el('div', 'lab-row'); nodes.forEach(n => n && r.appendChild(n)); return r; }

// The headline: a live component Lab. Pick a style → it applies app-wide,
// instantly, and persists. Built as a two-column layout (left sub-nav of
// component categories, right = the active category's style grid).
function renderComponentLab(root) {
  const st = state.settings;
  const sec = labSection('Komponent-lab',
    'Velg en stil — den brukes i hele appen med én gang, og huskes. Forhåndsvisningen i hvert kort viser sin egen stil.');
  const card = el('div', 'card lab-card lab-live');
  const cols = el('div', 'lab-live-cols');

  // left sub-nav: Knapper / Felt / Nedtrekk — all live, selectable categories
  const nav = el('div', 'lab-subnav');
  const cats = [
    { key: 'knapper', label: 'Knapper' },
    { key: 'felt', label: 'Felt' },
    { key: 'nedtrekk', label: 'Nedtrekk' },
  ];
  if (!cats.some(c => c.key === labCategory)) labCategory = 'knapper';
  cats.forEach(c => {
    const item = el('button', 'lab-subnav-item' + (c.key === labCategory ? ' active' : ''));
    item.type = 'button';
    item.appendChild(el('span', null, c.label));
    item.addEventListener('click', () => {
      if (labCategory === c.key) return;
      labCategory = c.key;
      renderDesignLab();   // swap the right-hand panel to this category's grid
    });
    nav.appendChild(item);
  });

  // right panel: the active category's style grid
  const panel = el('div', 'lab-live-panel');
  if (labCategory === 'felt') buildFieldStyleGrid(panel);
  else if (labCategory === 'nedtrekk') buildDdStyleGrid(panel);
  else buildBtnStyleGrid(panel);

  cols.append(nav, panel);
  card.appendChild(cols);
  sec.appendChild(card);
  root.appendChild(sec);
}

// Knapper — primary-button style cards
function buildBtnStyleGrid(panel) {
  const st = state.settings;
  const grid = el('div', 'btn-style-grid');
  BTN_STYLES.forEach(s => {
    const isActive = st.btnStyle === s.key;
    const cardEl = el('button', 'btn-style-card' + (isActive ? ' active' : ''));
    cardEl.type = 'button';
    cardEl.dataset.btnStyle = s.key;  // scopes the preview to THIS style, regardless of global
    if (isActive) cardEl.appendChild(el('span', 'btn-style-badge', 'AKTIV'));
    const sampleWrap = el('div', 'btn-style-sample');
    const sample = button({ label: 'Legg til', variant: 'primary', icon: 'plus' });
    sample.tabIndex = -1;  // the whole card is the click target
    sampleWrap.appendChild(sample);
    const meta = el('div', 'btn-style-meta');
    meta.appendChild(el('div', 'btn-style-name', s.label));
    meta.appendChild(el('div', 'btn-style-desc', s.desc));
    cardEl.append(sampleWrap, meta);
    cardEl.addEventListener('click', () => {
      if (state.settings.btnStyle === s.key) return;
      state.settings.btnStyle = s.key;
      applySettings();        // flips data-btn-style on <html> → every .btn.primary updates live
      renderDesignLab();      // re-render so the AKTIV badge moves
      scheduleSave();
    });
    grid.appendChild(cardEl);
  });
  panel.appendChild(grid);
}

// Felt — form-field style cards. Each card previews its own variant via the
// data-field-style wrapper, regardless of the global setting.
function buildFieldStyleGrid(panel) {
  const st = state.settings;
  const grid = el('div', 'btn-style-grid');
  FIELD_STYLES.forEach(s => {
    const isActive = st.fieldStyle === s.key;
    const cardEl = el('button', 'btn-style-card' + (isActive ? ' active' : ''));
    cardEl.type = 'button';
    cardEl.dataset.fieldStyle = s.key;  // scopes the preview to THIS style
    if (isActive) cardEl.appendChild(el('span', 'btn-style-badge', 'AKTIV'));
    const sampleWrap = el('div', 'btn-style-sample');
    // a real .field text input — shows its own variant via the wrapper attr
    const inp = document.createElement('input');
    inp.className = 'field'; inp.type = 'text'; inp.placeholder = 'Søk…';
    inp.tabIndex = -1;
    sampleWrap.appendChild(inp);
    const meta = el('div', 'btn-style-meta');
    meta.appendChild(el('div', 'btn-style-name', s.label));
    meta.appendChild(el('div', 'btn-style-desc', s.desc));
    cardEl.append(sampleWrap, meta);
    cardEl.addEventListener('click', () => {
      if (state.settings.fieldStyle === s.key) return;
      state.settings.fieldStyle = s.key;
      applySettings();        // flips data-field-style on <html> → every .field updates live
      renderDesignLab();
      scheduleSave();
    });
    grid.appendChild(cardEl);
  });
  panel.appendChild(grid);
}

// Nedtrekk — dropdown-menu (.pop) style cards. Each card shows a static open
// .pop mock scoped to its own variant via the data-dd-style wrapper.
function buildDdStyleGrid(panel) {
  const st = state.settings;
  const grid = el('div', 'btn-style-grid');
  DD_STYLES.forEach(s => {
    const isActive = st.ddStyle === s.key;
    const cardEl = el('button', 'btn-style-card' + (isActive ? ' active' : ''));
    cardEl.type = 'button';
    cardEl.dataset.ddStyle = s.key;  // scopes the preview to THIS style
    if (isActive) cardEl.appendChild(el('span', 'btn-style-badge', 'AKTIV'));
    const sampleWrap = el('div', 'btn-style-sample dd-style-sample');
    // a static, always-open .pop mock so the menu style is visible in the card
    const pop = el('div', 'pop dd-style-mock');
    [['Lav', false], ['Normal', true], ['Høy', false]].forEach(([txt, sel]) => {
      const item = el('div', 'pop-item' + (sel ? ' selected' : ''));
      item.append(el('span', null, txt));
      const ck = el('span', 'pop-check'); ck.innerHTML = icon('check'); item.appendChild(ck);
      pop.appendChild(item);
    });
    sampleWrap.appendChild(pop);
    const meta = el('div', 'btn-style-meta');
    meta.appendChild(el('div', 'btn-style-name', s.label));
    meta.appendChild(el('div', 'btn-style-desc', s.desc));
    cardEl.append(sampleWrap, meta);
    cardEl.addEventListener('click', () => {
      if (state.settings.ddStyle === s.key) return;
      state.settings.ddStyle = s.key;
      applySettings();        // flips data-dd-style on <html> → every .pop updates live
      renderDesignLab();
      scheduleSave();
    });
    grid.appendChild(cardEl);
  });
  panel.appendChild(grid);
}

function renderDesignLab() {
  labBuilt = true;
  const root = document.getElementById('labRoot');
  root.textContent = '';

  // ---- LIVE COMPONENT LAB (headline) ----
  renderComponentLab(root);

  // ---- TOKENS: colour palette ----
  {
    const sec = labSection('Farger', 'Overflater og statusfarger — følger valgt tema.');
    const card = el('div', 'card lab-card');
    const wrap = el('div', 'tok-colors');
    const colorVars = [
      ['--bg', 'Bakgrunn'], ['--surface-1', 'Overflate 1'], ['--surface-2', 'Overflate 2'], ['--surface-3', 'Overflate 3'],
      ['--ink', 'Tekst'], ['--muted', 'Dempet'], ['--faint', 'Svak'], ['--accent', 'Aksent'],
      ['--ok', 'OK'], ['--warn', 'Advarsel'], ['--danger', 'Fare'], ['--line', 'Linje'],
    ];
    colorVars.forEach(([v, name]) => {
      const cell = el('div', 'tok-color');
      const box = el('div', 'swatch-box'); box.style.background = `var(${v})`;
      cell.append(box, el('div', 'tok-name', name), el('div', 'tok-var', v));
      wrap.appendChild(cell);
    });
    card.appendChild(wrap); sec.appendChild(card); root.appendChild(sec);
  }

  // ---- TOKENS: type scale ----
  {
    const sec = labSection('Typografi', 'Geist · ett størrelse/vekt-sett per rolle.');
    const card = el('div', 'card lab-card');
    const wrap = el('div', 'tok-type');
    const types = [
      ['--fs-xl', '21px', 'Sidetittel'], ['--fs-lg', '17px', 'Seksjon'], ['--fs-md', '15px', 'Korttittel'],
      ['--fs-base', '13.5px', 'Brødtekst'], ['--fs-sm', '12.5px', 'Etikett'], ['--fs-xs', '11px', 'Meta'],
    ];
    types.forEach(([v, px, role]) => {
      const r = el('div', 'tok-type-row');
      r.appendChild(el('span', 'tt-meta', `${role} · ${v} · ${px}`));
      const sample = el('span', null, 'Oppfølging Aa Bb 123');
      sample.style.fontSize = `var(${v})`;
      r.appendChild(sample);
      wrap.appendChild(r);
    });
    // weights
    const wrow = el('div', 'tok-type-row');
    wrow.appendChild(el('span', 'tt-meta', 'Vekter 400/500/600/700'));
    const ws = el('span');
    [['400', 'Regular'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold']].forEach(([w, n], i) => {
      const s = el('span', null, n + (i < 3 ? '  ·  ' : '')); s.style.fontWeight = w; ws.appendChild(s);
    });
    wrow.appendChild(ws); wrap.appendChild(wrow);
    card.appendChild(wrap); sec.appendChild(card); root.appendChild(sec);
  }

  // ---- TOKENS: spacing scale ----
  {
    const sec = labSection('Avstand', 'Spacing-skala — 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.');
    const card = el('div', 'card lab-card');
    const wrap = el('div', 'tok-space');
    [['--sp-1', 4], ['--sp-2', 8], ['--sp-3', 12], ['--sp-4', 16], ['--sp-5', 20], ['--sp-6', 24], ['--sp-8', 32], ['--sp-10', 40]].forEach(([v, px]) => {
      const cell = el('div', 'ts-cell');
      const bar = el('div', 'ts-bar'); bar.style.width = px + 'px'; bar.style.height = px + 'px';
      cell.append(bar, el('div', 'ts-meta', `${v}`), el('div', 'ts-meta', px + 'px'));
      wrap.appendChild(cell);
    });
    card.appendChild(wrap); sec.appendChild(card); root.appendChild(sec);
  }

  // ---- TOKENS: depth / elevation (the "emerging from dark" model) ----
  {
    const sec = labSection('Dybde / Elevation',
      'Vinduet er det mørkeste laget. Hvert nivå løftes ~7 % mot hvitt, som om flatene stiger ut av mørket. Tydelig på mørke tema, dempet på lyse.');
    const card = el('div', 'card lab-card');
    const wrap = el('div', 'depth');

    // 1) concentric nested layers: bg → surface-1 → surface-2 → surface-3
    const stack = el('div', 'depth-stack');
    stack.appendChild(el('span', 'depth-tag', 'Bakgrunn · --bg · 0 %'));
    const l1 = el('div', 'depth-layer s1');
    l1.append(el('div', 'depth-name', 'Overflate 1 — kort, sidefelt'), el('div', 'depth-meta', '--surface-1 · +7 % mot hvitt'));
    const l2 = el('div', 'depth-layer s2');
    l2.append(el('div', 'depth-name', 'Overflate 2 — hevet i kort, felter'), el('div', 'depth-meta', '--surface-2 · +14 %'));
    const l3 = el('div', 'depth-layer s3');
    l3.append(el('div', 'depth-name', 'Overflate 3 — meny, dato, dialog'), el('div', 'depth-meta', '--surface-3 · +22 %'));
    l2.appendChild(l3); l1.appendChild(l2); stack.appendChild(l1);
    wrap.appendChild(stack);

    // 2) side-by-side swatch ladder so the steps are unmistakable
    const ladder = el('div', 'depth-ladder');
    [['--bg', 'Bakgrunn (mørkest)', '0 %'], ['--surface-1', 'Overflate 1', '+7 %'],
     ['--surface-2', 'Overflate 2', '+14 %'], ['--surface-3', 'Overflate 3', '+22 %']].forEach(([v, name, pct]) => {
      const rung = el('div', 'depth-rung');
      const sw = el('div', 'dr-swatch'); sw.style.background = `var(${v})`;
      rung.append(sw, el('span', 'dr-name', `${name}`), el('span', 'dr-var', `${v} · ${pct}`));
      ladder.appendChild(rung);
    });
    wrap.appendChild(ladder);

    card.appendChild(wrap);

    // 3) shadow scale (border-defined, shadcn — no glow)
    const shCard = el('div', 'card lab-card'); shCard.style.marginTop = 'var(--sp-4)';
    const shWrap = el('div', 'tok-elev');
    [['Flat', 'var(--elev-1)', 'var(--surface-1)'], ['Kort', 'var(--elev-2)', 'var(--surface-1)'], ['Hevet', 'var(--elev-3)', 'var(--surface-2)'], ['Pop-over', 'var(--elev-pop)', 'var(--surface-3)']].forEach(([name, sh, bg]) => {
      const cell = el('div', 'te-cell');
      const box = el('div', 'te-box', name); box.style.boxShadow = sh; box.style.background = bg;
      cell.append(box, el('div', 'te-meta', name));
      shWrap.appendChild(cell);
    });
    shCard.appendChild(shWrap);

    sec.appendChild(card); sec.appendChild(shCard); root.appendChild(sec);
  }

  // ---- COMPONENTS: buttons ----
  {
    const sec = labSection('Knapper', 'Primær / sekundær / spøkelse / fare / ikon — alle på --control-h.');
    const card = el('div', 'card lab-card');
    const r1 = labRow(
      button({ label: 'Primær', variant: 'primary', icon: 'plus' }),
      button({ label: 'Sekundær', variant: 'secondary' }),
      button({ label: 'Spøkelse', variant: 'ghost' }),
      button({ label: 'Fare', variant: 'danger', icon: 'trash' }),
      button({ label: 'Deaktivert', variant: 'primary', disabled: true }),
    );
    const ib1 = el('button', 'icon-btn'); ib1.innerHTML = icon('plus');
    const ib2 = el('button', 'icon-btn'); ib2.innerHTML = icon('settings');
    const ib3 = el('button', 'icon-btn bare'); ib3.innerHTML = icon('more-horizontal');
    const r2 = labRow(
      button({ label: 'Liten', variant: 'secondary', sm: true }),
      ib1, ib2, ib3,
    );
    card.append(labCell('Varianter', r1), el('div', null, ''), labCell('Liten + ikon', r2));
    sec.appendChild(card); root.appendChild(sec);
  }

  // ---- COMPONENTS: inputs / select / combobox / datepicker ----
  {
    const sec = labSection('Felter', 'Tekst, valg, kombiboks og dato-velger — alle samme høyde.');
    const card = el('div', 'card lab-card');
    const grid = el('div', 'lab-grid');

    const ti = document.createElement('input'); ti.className = 'field'; ti.placeholder = 'Tekstfelt…'; ti.style.width = '200px';
    grid.appendChild(labCell('Tekst', ti));

    const ta = document.createElement('textarea'); ta.className = 'field'; ta.placeholder = 'Tekstområde…'; ta.style.width = '220px';
    grid.appendChild(labCell('Tekstområde', ta));

    const ddHost = el('div'); ddHost.style.width = '200px';
    buildDropdown(ddHost, { value: 'normal', items: [{ value: 'low', label: 'Lav' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Høy' }] });
    grid.appendChild(labCell('Nedtrekk (select)', ddHost));

    const cbHost = el('div'); cbHost.style.width = '200px';
    buildCombo(cbHost, { getItems: () => state.contacts.map(c => ({ value: c.id, label: c.initials })) });
    grid.appendChild(labCell('Søkbar kombiboks', cbHost));

    const dpHost = el('div'); dpHost.style.width = '200px';
    buildDatePicker(dpHost, { placeholder: 'Velg dato' });
    grid.appendChild(labCell('Dato-velger', dpHost));

    card.appendChild(grid); sec.appendChild(card); root.appendChild(sec);
  }

  // ---- COMPONENTS: selection controls ----
  {
    const sec = labSection('Valg-kontroller', 'Avkryssing, radio, bryter, segmentert.');
    const card = el('div', 'card lab-card');
    const grid = el('div', 'lab-grid');

    const cbRow = labRow(
      buildCheckbox({ checked: true, label: 'Avkrysset' }).el,
      buildCheckbox({ checked: false, label: 'Tom' }).el,
      buildCheckbox({ checked: false, label: 'Deaktivert', disabled: true }).el,
    );
    grid.appendChild(labCell('Avkryssing', cbRow));

    grid.appendChild(labCell('Radio', buildRadioGroup({ value: 'b', items: [{ value: 'a', label: 'Én' }, { value: 'b', label: 'To' }, { value: 'c', label: 'Tre' }] }).el));

    grid.appendChild(labCell('Bryter', labRow(buildToggle({ checked: true, label: 'På' }).el, buildToggle({ checked: false, label: 'Av' }).el)));

    grid.appendChild(labCell('Segmentert', buildSegmented({ value: 'm', items: [{ value: 'd', label: 'Dag' }, { value: 'm', label: 'Måned' }, { value: 'y', label: 'År' }] }).el));

    card.appendChild(grid); sec.appendChild(card); root.appendChild(sec);
  }

  // ---- COMPONENTS: slider + progress ----
  {
    const sec = labSection('Skyvere & fremdrift', 'Aksent-fylt skyver og fremdriftslinje.');
    const card = el('div', 'card lab-card');
    const s1 = buildSlider({ min: 0, max: 100, step: 1, value: 40 });
    const sRow = el('div', 'range-row'); const sVal = el('span', 'range-val', '40');
    s1.el.addEventListener('keydown', () => setTimeout(() => sVal.textContent = String(s1.value), 0));
    sRow.append(s1.el, sVal);
    const p = el('div', 'progress'); const pf = el('span'); pf.style.width = '64%'; p.appendChild(pf);
    const pWrap = el('div'); pWrap.style.width = '280px'; pWrap.appendChild(p);
    const p2 = el('div', 'progress ok'); const pf2 = el('span'); pf2.style.width = '100%'; p2.appendChild(pf2);
    const pWrap2 = el('div'); pWrap2.style.width = '280px'; pWrap2.appendChild(p2);
    card.append(labCell('Skyver', sRow), el('div'), labCell('Fremdrift', pWrap), labCell('Fullført', pWrap2));
    sec.appendChild(card); root.appendChild(sec);
  }

  // ---- COMPONENTS: chips / badges / avatars ----
  {
    const sec = labSection('Brikker, merker & avatarer', null);
    const card = el('div', 'card lab-card');
    const chips = el('div', 'lab-row');
    [['chip person', 'AB'], ['chip due', '14. jun'], ['chip due overdue', 'Forfalt'], ['chip prio-high', 'Høy'], ['chip prio-low', 'Lav'], ['chip ok', 'OK'], ['chip warn', 'Advarsel'], ['chip solid', 'Solid'], ['chip outline', 'Omriss']].forEach(([cls, txt]) => chips.appendChild(el('span', cls, txt)));
    const badges = labRow(el('span', 'badge', '3'), el('span', 'badge', '12'), el('span', 'badge muted', '99+'));
    const avs = labRow(
      (() => { const a = el('span', 'avatar sm', 'AB'); return a; })(),
      (() => { const a = el('span', 'avatar', 'CD'); return a; })(),
      (() => { const a = el('span', 'avatar lg', 'EF'); return a; })(),
      (() => { const a = el('span', 'avatar neutral', 'GH'); return a; })(),
    );
    card.append(labCell('Brikker', chips), labCell('Merker', badges), labCell('Avatarer', avs));
    sec.appendChild(card); root.appendChild(sec);
  }

  // ---- COMPONENTS: cards (elevation) + list item ----
  {
    const sec = labSection('Kort & listeelement', 'Kort i ulike høyder, og et listeelement slik det vises i Gjøremål.');
    const grid = el('div', 'lab-grid');
    ['elev-1', 'elev-2', 'elev-3'].forEach((cls, i) => {
      const c = el('div', 'card ' + cls); c.style.width = '160px'; c.style.height = '88px'; c.style.display = 'grid'; c.style.placeItems = 'center'; c.style.color = 'var(--muted)'; c.style.fontSize = 'var(--fs-sm)';
      c.textContent = 'Kort · ' + cls;
      grid.appendChild(c);
    });
    const sec2 = el('div', 'lab-section');
    sec.appendChild(grid);
    // list item sample
    const list = el('div', 'item-list'); list.style.maxWidth = '520px';
    list.appendChild(taskEl({ id: '_demo1', title: 'Eksempel-gjøremål', note: 'Et kort notat på listeelementet.', due: todayStr(), priority: 'high', contactId: null, done: false }));
    list.appendChild(taskEl({ id: '_demo2', title: 'Fullført element', note: '', due: '', priority: 'normal', contactId: null, done: true }));
    // strip the demo delete/checkbox side-effects: clone is fine for display, but
    // these reference state.tasks; guard by replacing handlers is overkill — the
    // demo ids don't exist in state so delete/check just no-op the lists.
    sec.appendChild(labCell('Listeelement', list));
    root.appendChild(sec);
  }

  // ---- COMPONENTS: empty state, tooltip, menu, modal ----
  {
    const sec = labSection('Tilstander & overlegg', 'Tom tilstand, verktøytips, meny og dialog.');
    const card = el('div', 'card lab-card');

    const es = el('div', 'empty-state');
    const esic = el('div', 'es-ic'); esic.innerHTML = icon('inbox');
    es.append(esic, el('div', 'es-title', 'Ingenting her ennå'), el('div', 'es-sub', 'Tom-tilstand for tomme lister og søk uten treff.'));
    const esWrap = el('div', 'card flush'); esWrap.style.maxWidth = '360px'; esWrap.appendChild(es);

    const tipBtn = button({ label: 'Hold over meg', variant: 'secondary' }); tipBtn.dataset.tip = 'Egendefinert verktøytips';

    const menuBtn = button({ label: 'Åpne meny', variant: 'secondary', icon: 'more-horizontal' });
    const menuHost = el('div'); menuHost.style.position = 'relative'; menuHost.appendChild(menuBtn);
    menuBtn.addEventListener('click', () => buildMenu(menuBtn, [
      { label: 'Rediger', icon: 'edit', onClick: () => {} },
      { label: 'Vis datafil', icon: 'folder', onClick: () => {} },
      { sep: true },
      { label: 'Slett', icon: 'trash', danger: true, onClick: () => {} },
    ]));

    const modalBtn = button({ label: 'Åpne dialog', variant: 'primary' });
    modalBtn.addEventListener('click', () => confirmModal({ title: 'Bekreft handling', body: 'Dette er en egendefinert dialog — ingen native vinduer.', confirmLabel: 'Bekreft' }));

    card.append(labCell('Tom tilstand', esWrap), labCell('Verktøytips', tipBtn), labCell('Meny', menuHost), labCell('Dialog', modalBtn));
    sec.appendChild(card); root.appendChild(sec);
  }

  hydrateIcons(root);
}

// =====================================================================
// boot
// =====================================================================
function renderAll() {
  applySettings();
  renderYear(); renderGrid(); renderTasks(); renderReferat(); renderKalender(); renderHjem();
  renderSettings();
  document.getElementById('summary').value = state.summary;
  if (labBuilt || state.view === 'designlab') renderDesignLab();
  // On launch, open the configured landing view. Fall back to 'hjem' if the
  // stored landingView is invalid; the hidden 'notes' view is never a landing.
  const landing = LANDING_VIEWS.includes(state.settings.landingView) ? state.settings.landingView : 'hjem';
  setView(landing);
}

// =====================================================================
// auto-update — visible status in Settings + a global "ready" banner
// =====================================================================
// Single source of truth for the latest update phase, so both the Settings
// pane and the banner reflect it. The status listener is wired ONCE in init().
function initUpdates() {
  const api = window.api && window.api.updates;
  if (!api) return;

  const verEl     = document.getElementById('updVersion');
  const checkBtn  = document.getElementById('updCheckBtn');
  const installBtn = document.getElementById('updInstallBtn');
  const statusEl  = document.getElementById('updStatus');
  const banner    = document.getElementById('updBanner');
  const bannerTxt = banner && banner.querySelector('.upd-banner-text');
  const bannerInstall = document.getElementById('updBannerInstall');
  const bannerDismiss = document.getElementById('updBannerDismiss');

  // current version label
  if (verEl) api.version().then(v => { verEl.textContent = v || '—'; }).catch(() => {});

  let bannerDismissed = false;

  const reflect = (s) => {
    if (!s || !s.phase) return;
    if (statusEl) {
      statusEl.classList.remove('is-error', 'is-ok');
      let msg = '';
      switch (s.phase) {
        case 'dev':         msg = 'Oppdateringer er bare tilgjengelig i den installerte appen.'; break;
        case 'checking':    msg = 'Sjekker…'; break;
        case 'available':   msg = 'Oppdatering tilgjengelig' + (s.version ? ' (v' + s.version + ')' : '') + ' — laster ned…'; break;
        case 'downloading': msg = 'Laster ned… ' + (s.percent != null ? s.percent + ' %' : ''); break;
        case 'downloaded':  msg = 'Oppdatering klar' + (s.version ? ' (v' + s.version + ')' : '') + '.'; statusEl.classList.add('is-ok'); break;
        case 'none':        msg = 'Du har siste versjon.'; statusEl.classList.add('is-ok'); break;
        case 'error':       msg = 'Kunne ikke sjekke etter oppdateringer.'; statusEl.classList.add('is-error'); break;
      }
      statusEl.textContent = msg;
    }
    // the "Start på nytt" button (in the pane) appears only when ready
    if (installBtn) installBtn.classList.toggle('hidden', s.phase !== 'downloaded');
    // the check button is busy while checking/downloading
    if (checkBtn) checkBtn.disabled = (s.phase === 'checking' || s.phase === 'downloading');

    // global banner: only on 'downloaded', unless the user dismissed it
    if (banner) {
      if (s.phase === 'downloaded' && !bannerDismissed) {
        if (bannerTxt) bannerTxt.textContent = 'Ny versjon klar' + (s.version ? ' · v' + s.version : '');
        banner.classList.remove('hidden');
      } else if (s.phase !== 'downloaded') {
        banner.classList.add('hidden');
      }
    }
  };

  const doInstall = () => { api.install().catch(() => {}); };

  if (checkBtn) checkBtn.addEventListener('click', () => {
    api.check().then(reflect).catch(() => reflect({ phase: 'error' }));
  });
  if (installBtn) installBtn.addEventListener('click', doInstall);
  if (bannerInstall) bannerInstall.addEventListener('click', doInstall);
  if (bannerDismiss) bannerDismiss.addEventListener('click', () => {
    bannerDismissed = true;
    if (banner) banner.classList.add('hidden');
  });

  // the live stream from main drives everything (both pane + banner)
  api.onStatus(reflect);
  // expose for headless verification of the banner path
  window.__updReflect = reflect;
}

// =====================================================================
// custom frameless window controls
// =====================================================================
function initWindowControls() {
  const w = window.api && window.api.win;
  if (!w) return;
  const min = document.getElementById('winMin');
  const max = document.getElementById('winMax');
  const close = document.getElementById('winClose');
  const tb = document.getElementById('titlebar');
  if (min) min.addEventListener('click', () => w.minimize());
  if (max) max.addEventListener('click', () => w.maximizeToggle());
  if (close) close.addEventListener('click', () => w.close());
  // double-clicking the drag strip maximizes / restores, like a native title bar
  if (tb) tb.addEventListener('dblclick', (e) => {
    if (e.target.closest('.win-controls')) return;
    w.maximizeToggle();
  });
  const setMax = (v) => { if (max) max.classList.toggle('is-maximized', !!v); };
  if (w.onMaximizeChange) w.onMaximizeChange(setMax);
  if (w.isMaximized) w.isMaximized().then(setMax).catch(() => {});
}

// On close, main asks us to flush any debounced save before the window dies, so
// a change made a fraction of a second before quitting is never lost.
function initFlushOnClose() {
  if (!window.api || !window.api.onFlush) return;
  window.api.onFlush(async () => {
    clearTimeout(saveTimer);
    try { await window.api.save(state); } catch (_) { /* ignore — closing anyway */ }
    window.api.flushed();
  });
}

(async function init() {
  hydrateIcons(document);   // static nav + header icons
  initWindowControls();
  initFlushOnClose();
  initUpdates();
  state = normalize(await window.api.load());
  bind();
  renderAll();
})();
