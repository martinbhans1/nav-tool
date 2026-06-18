# nav-tool — "Oppfølging"

A local, offline Windows desktop app (Electron) for NAV-style follow-up work.
Single-window, frameless, custom design system, Norwegian UI. Data is sensitive
→ **everything local, initials only, zero network** (except the optional GitHub
auto-update check).

## Views (left sidebar nav)
- **Hjem** — dashboard / default landing. Time-based greeting + date, four live
  stat tiles (Kontaktet denne måneden %, Forfalt, I dag, Denne uken), today's +
  overdue agenda inline, quick-link shortcuts.
- **Oversikt** — month grid: contacts as rows, Jan–Des as columns, contacted
  toggle cells + per-month % footer (sticky). Click a month **header** to
  bulk-mark everyone that month (confirm modal unless the column is empty).
  Click a person's **initials** → Kontakt-detalj modal.
- **Gjøremål** — tasks (title/note/due/priority/person), add + active/done lists,
  enter/leave animations, "+1 dag" snooze.
- **Referat** — reminders to write referater in NAV's own system (not the text).
- **Kalender** — forward-looking agenda: tasks (by due) + referater (by date)
  bucketed Forfalt / I dag / I morgen / Denne uken / Senere; quick actions.
- **Innstillinger** — categorized settings (see below).
- **Designlab** — the live **component Lab**: pick a style for Knapper / Felt /
  Nedtrekk and it applies app-wide instantly (per-card previews, AKTIV badge).
- **Notater** — hidden for now (`.nav-item.hidden`); single textarea, kept but
  not exposed. Re-enable / rebuild as structured notes if wanted.
- **Søk** — Ctrl/Cmd+K command palette (also a sidebar affordance): searches
  contacts/tasks/referater, jumps to the contact detail or the relevant view.
- **Kontakt-detalj** — modal (`openContactDetail(id)`): a person's year contact
  history (clickable month pills), their tasks + referater, scoped quick-add,
  Fjern kontakt.

## Privacy (hard requirement)
- Renderer CSP blocks all connections; UI touches disk only via IPC.
- Data lives in ONE local JSON file in the OS user-data dir
  (`navtool-data.json`; *Fil → Vis datafil i mappe* or Innstillinger → Sikkerhetskopi).
  Never committed, never leaves the machine. Only network = the auto-update check.

## Run / build
```bash
npm install
npm start      # dev (electron .) — live code from renderer/
npm run dist   # local unsigned installer into dist/ (no publish)
```
`dist/` and `node_modules/` are gitignored. `build/icon.ico` is the app icon
(set via `build.win.icon`).

## Architecture (single-page renderer, NO bundler — plain global functions)
- **`main.js`** — frameless window (`frame:false`); IPC: `data:load/save/dataPath/
  reveal/export/import` and window controls `win:minimize/maximizeToggle/close/
  isMaximized` (+ `win:maximized` event). **Flush-on-close**: on `close` it holds
  the window, sends `app:flush`, renderer saves then `app:flushed` → destroy (so a
  debounced save is never lost). **Cache-clear guard**: on `whenReady` it
  `clearCodeCaches()` + `clearCache()` before creating the window (see Gotchas).
  Auto-updater wrapped in try/catch (no-ops unpacked/offline).
- **`preload.js`** — exposes `window.api`: `load/save/exportBackup/importBackup/
  dataPath/revealData`, `win.{minimize,maximizeToggle,close,isMaximized,onMaximizeChange}`,
  `onFlush/flushed`.
- **`renderer/index.html`** — frameless titlebar + sidebar nav + a `<section
  class="view" data-view="X">` per view.
- **`renderer/app.js`** — everything: state model, helpers, render fns, the
  settings/theming engine, the Lab, the search palette. Key pieces:
  - **State**: `{version, view, year, contacts[{id,initials}], contacted{cid:{year:[bool×12]}},
    tasks[{id,title,note,due,priority,contactId,done,doneAt,createdAt}],
    referater[{id,title,note,date,...}], summary, customThemes[], settings{…}}`.
    `defaultState()` / `normalize()` (validates + migrates v1) / persisted via
    debounced `scheduleSave()`.
  - **Helpers** (reuse these): `todayStr, addDays, fmtDate` (reads
    `settings.dateFormat`), `isOverdue, clamp, el, icon` (Lucide `LUCIDE` map),
    `hydrateIcons, contactById, initialsFor, cellGet/cellSet, personChip, dueChip`.
  - **Component builders** (all native-free): `buildDropdown, buildCombo,
    buildDatePicker, buildSlider` (onInput live + onChange on release),
    `buildSegmented, buildCheckbox, buildToggle, buildColorWell` (opens an HSV
    `colorPickerModal`), `buildMenu, openModal, confirmModal`. **NEVER** a native
    `<select>/<input type=date|checkbox|range|color>/<datalist>` (plain text
    inputs are fine).
  - **Theming**: `applySettings()` writes the palette + tokens as CSS variables and
    sets `data-theme/density/contacted/bg/motion/btn-style/field-style/dd-style`
    on `<html>`. `THEMES` = built-in vibe bundles; `allThemes()` merges in
    `state.customThemes`; use it for every theme lookup. Custom themes: builder in
    the Tema settings category derives a full palette from bg/ink/accent.
  - **Settings**: `renderSettings()` builds a categorized two-column view
    (`SETTINGS_CATS` + `settingsCategory`): Tema (grid + accent + live
    `buildThemePreview` + "Lag eget tema") / Utseende / Tekst & størrelse / Atferd
    / Sikkerhetskopi / Tilbakestill. Settings keys: `theme, accent, font, scale,
    radius, density, readingSize, background, contacted, btnStyle, fieldStyle,
    ddStyle, gradientStrength, motion, headingFont, landingView, defaultPriority,
    defaultDue, dateFormat`. Launch opens `settings.landingView`.
  - **Lab**: `renderComponentLab()` with `BTN_STYLES/FIELD_STYLES/DD_STYLES`;
    each applies app-wide via the `data-*-style` attrs + `[data-btn-style="x"] …`
    CSS, scoped also onto each preview card.
  - **Agenda**: `agendaEntries()/agendaBucket()/agendaCardEl()` power both Kalender
    and the Hjem "I dag" block; `refreshAgendaViews()` keeps them in sync.
  - **Search**: Ctrl/Cmd+K palette (`cmdkOpen/Toggle`, bound in `bind()`).
- **`renderer/styles.css`** — design tokens in `:root` (spacing `--sp-*`, type
  `--fs-*` × `--fs-mult`, weights, radius `--r*`, `--control-h`, elevation,
  surfaces lift off `--bg` toward white, `--grad-strength` gradient). All
  component CSS is token-driven; per-theme tweaks under `[data-theme="…"]`.

## Conventions
- **Design system is the source of truth** — token-driven, native-free, offline
  (self-hosted Geist; Georgia/Palatino system serif). Owner is pedantic about
  consistency: match existing components, Norwegian UI, no hardcoded hex (derive
  from `--accent` etc.).
- **Verify any change headlessly** before declaring done: throwaway `verify.js` →
  `app.whenReady`, stub the `data:*` + `win:*` ipcMain handlers (and
  `ipcMain.on('app:flushed')`), hidden frameless `BrowserWindow` (real preload,
  `show:false`), load `renderer/index.html`, fail on `console-message` level≥2 /
  `did-fail-load`, assert
  `querySelectorAll('select,input[type=date],input[type=checkbox],input[type=range],input[type=color],datalist').length===0`.
  Run `MSYS_NO_PATHCONV=1 ./node_modules/.bin/electron verify.js`; delete after.

## Gotchas (hard-won)
- **Per-app cache trap**: `npm start` runs as app name "nav-tool" → cache in
  `%APPDATA%/nav-tool`; a bare `electron some-script.js` runs as "Electron" →
  `%APPDATA%/Electron`. A stale renderer can be served after a change/update,
  making the app "look old" though the files are new. Fixed by the cache-clear
  guard in `main.js` (clears on every launch). When debugging "old UI", suspect
  **(1)** this cache, **(2)** the selected **density** (`compact` looks very
  different), **(3)** the selected **theme** (Sand ≠ Estetisk).
- Screenshotting a hidden `BrowserWindow` lags one frame (esp. modals/overlays);
  double-capture or probe the DOM instead.
- `taskkill` from Git Bash needs `MSYS_NO_PATHCONV=1`. Don't kill all
  `electron.exe` — other projects (e.g. m3code) run their own.
- Inspect a running packed app via `--remote-debugging-port` + a Node CDP client
  (Node 24 has global `WebSocket`).

## Versioning + build rhythm (current)
Semver in `package.json` `version`. **Currently NOT publishing** (not shown to the
end user yet). Rhythm while building: bump the **minor** version per feature, commit
locally, no publish. Now at **1.5.0**.

**When ready to ship** (auto-update pipeline, public repo
`github.com/martinbhans1/nav-tool`, `gh` authed as martinbhans1):
```bash
# bump version, commit, then:
GH_TOKEN="$(gh auth token)" npm run release   # electron-builder --publish always
```
Publishes a non-draft Release (tag `v<version>`) with three required assets —
`nav-tool-setup-<v>.exe`, `latest.yml`, `….exe.blockmap` (don't delete). The
installed app checks GitHub on launch, downloads a newer release in the
background, installs on next restart. Latest install page:
`https://github.com/martinbhans1/nav-tool/releases/latest`.

## Caveats
- **Unsigned** → SmartScreen "Windows beskyttet PC-en din" on first install
  (*Mer info → Kjør likevel*). A paid cert would remove it; not worth it for
  personal use.

## Possible next features (none committed)
- **Strukturerte notater** — replace the hidden textarea with titled note cards.
- **Månedsrapport / eksport** — printable monthly summary.
- **Desktop notifications** — local reminders, *but* nothing has a timestamp yet,
  so it needs a time model first (deferred).
