# Rikari

Full web app implementation of the Rikari financial/business manager designed
in `project/Rikari.dc.html`, rebuilt as a real client-server application so
Amanda can log in and use the same data from her phone and computer.

- `server/` — Node.js + TypeScript + Express + Prisma (SQLite) REST API.
  Owns auth and all business logic (service cost, DRE, pró-labore, balance
  sheet reconciliation, etc.) — see `server/src/calc.ts`.
- `web/` — React + Vite + TypeScript single-page app. Talks to the API over
  `fetch` with an httpOnly session cookie; React Query handles data fetching.

## Running locally

```bash
# Terminal 1 — API on http://localhost:4000
cd server
npm install
npx prisma migrate dev   # first time only, creates dev.db
npm run dev

# Terminal 2 — app on http://localhost:5173
cd web
npm install
npm run dev
```

Open http://localhost:5173, create an account (any email/password), and
start using the app. Data is stored per-account in `server/prisma/dev.db`
(SQLite) — nothing is shared between accounts, and the same account works
from any device that can reach the API.

## Notes

- **Spreadsheet export/import** ("Baixar planilha (Excel)" / importing
  `.xlsx`/`.csv` in Ajustes) loads SheetJS from `cdn.sheetjs.com` at runtime,
  in the browser — the same approach the original prototype used. This keeps
  a spreadsheet-parsing dependency (with a history of CVEs) off the server,
  but it does mean that feature needs normal internet access to work; CSV
  exports (DRE, balanço, lançamentos) and the JSON backup are fully
  self-contained and always work.
- **Money fields** are stored as floats (reais), matching the original
  design's arithmetic; values are rounded to cents on export/display.
- **Auth** is a simple email+password account (bcrypt + JWT in an httpOnly
  cookie) — enough for one business's two users (Amanda + her husband as
  sócio) to share a login across devices. No password reset flow yet.
- For production, swap `DATABASE_URL` in `server/.env` to a Postgres
  connection string and rerun `npx prisma migrate deploy` — the schema
  doesn't use anything SQLite-specific.
