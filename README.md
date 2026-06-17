# Oppfølging (nav-tool)

Et lokalt oppfølgingsverktøy — en kontakt-oversikt per måned, gjøremål og
notater. **All data ligger lokalt på maskinen. Ingenting sendes til skyen.**

- Rader = personer (kun **initialer** — ingen navn eller sensitiv info).
- Kolonner = månedene i året (bytt år øverst).
- Hver celle: **kontaktet / ikke kontaktet**. Nederst i hver kolonne vises
  prosent kontaktet den måneden.
- **Gjøremål** kan tildeles en person og hukes av når de er ferdige.
- **Notater** for et fritt sammendrag.

## Personvern
- Ingen nettverkskall i det hele tatt (blokkert i CSP).
- Data lagres i én lokal JSON-fil under brukerens app-data-mappe
  (`Fil → Vis datafil i mappe`).
- **Eksporter** lager en sikkerhetskopi-fil; **Importer** henter den inn igjen.
  Slik flyttes data mellom maskiner uten sky.

## Kjøre i utvikling
```bash
npm install
npm start
```

## Bygge en Windows-installer (.exe)
```bash
npm run dist
```
Installeren havner i `dist/`.
