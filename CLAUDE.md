# nav-tool — "Oppfølging"

A local, offline Windows desktop app (Electron) for NAV-style follow-up work:
a month-by-month **kontakt-oversikt** (contacts as rows, Jan–Des as columns,
contacted toggles + % per month), **gjøremål** (tasks: title/note/due/priority),
**referat-påminnelser** (reminders to write referater in NAV's own system — not
the text), **notater**, and a rich **Innstillinger** view (themes, accent, font,
density, reading size, background, corner radius — all CSS-variable driven).

## Privacy (hard requirement)
Sensitive personal data → **everything is local, initials only, zero network.**
- The renderer CSP blocks all connections; the UI only touches disk via IPC.
- Data lives in ONE local JSON file in the OS user-data dir
  (`navtool-data.json`; *Fil → Vis datafil i mappe*). It is **never** committed
  and never leaves the machine. The only network the app makes is the
  auto-update check to GitHub Releases (see below).

## Run / build
```bash
npm install
npm start            # dev (Electron, live code)
npm run dist         # build a local Windows installer into dist/  (no publish)
```
`dist/` and `node_modules/` are gitignored.

## GitHub
- Repo: **https://github.com/martinbhans1/nav-tool** — **public** (so the partner
  can download from Releases and auto-update without any token/account).
- `gh` is authed as **martinbhans1** (`gh auth token` yields the token).
- Public is fine: no secrets in the code, and her data is never in the repo.

## Versioning + releasing (the update pipeline)
Semver lives in `package.json` `version`. Auto-update compares against it, so
**every release must bump it.**

To ship an update:
1. Bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`). Commit it.
2. ```bash
   GH_TOKEN="$(gh auth token)" npm run release
   ```
   This runs `electron-builder --publish always`: builds the unsigned NSIS
   installer and **publishes a non-draft GitHub Release** (tag `v<version>`).
   `build.publish.releaseType` is `"release"`, so it goes live immediately and
   the newest becomes GitHub's "latest" — the auto-update target. One command,
   no manual un-drafting.

Each release uploads three assets — **all three are required**, do not delete:
- `nav-tool-setup-<v>.exe` — the installer she downloads
- `latest.yml` — the electron-updater manifest (how the app finds new versions)
- `…​.exe.blockmap` — enables small delta updates

Download page for her: `https://github.com/martinbhans1/nav-tool/releases/latest`.

## Auto-update
`main.js` (in `app.whenReady`) calls
`require('electron-updater').autoUpdater.checkForUpdatesAndNotify()`, wrapped in
try/catch. It **no-ops when unpackaged (dev) or offline**, so it never blocks the
app. In the installed app it checks GitHub on launch, downloads a newer release
in the background, and installs on the next restart. `electron-updater` is a
runtime **dependency** (not devDependency).

## Known caveats
- **Unsigned** → Windows SmartScreen shows "Windows beskyttet PC-en din" on first
  install (*Mer info → Kjør likevel*). Removing it permanently needs a paid
  code-signing certificate; not worth it for personal use.
- **No custom app icon yet** — electron-builder uses the default Electron icon
  (build log: "application icon is not set"). Add `build.win.icon` (a 256px
  `.ico`) when an icon exists.
