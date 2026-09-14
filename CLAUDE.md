# CLAUDE.md

Guidance for working in this repository.

## Who this is for

A 3rd-year software engineering student building a portfolio project she must be
able to defend line-by-line in a job interview. Every file and decision has to be
understandable and justifiable. Prefer simple and clear over clever.

## Product (context — not all built yet)

A book recommendation engine by writing style. Search for a book, get
stylistically similar books. Each recommendation comes back with an explained
rationale and a link to search for the book in a bookstore.

- **Data source (later):** Open Library API for metadata. Style attributes are
  tagged manually through a simple admin UI.
- **Algorithm (later):** a hand-designed weighted similarity function over
  hand-defined style attributes. No embeddings at this stage. Every
  recommendation must return with a rationale.
- **Interface:** web app, not CLI.

## Stack

- Backend: Python + FastAPI
- Database: PostgreSQL
- Frontend: minimal React in plain JavaScript (no TypeScript, no UI libraries,
  no state management)
- Docker for the database; Vite as the frontend build tool

## Build timeline

3 working days, then a 3-week break. Day 1 was 2026-09-06.

**Day 1 scope only — an empty running skeleton, zero business logic:**

- git repo with a proper `.gitignore`
- `docker-compose.yml` with Postgres only
- minimal FastAPI server with one endpoint `/health` returning ok
- minimal React (Vite) app that calls `/health` and shows the response
- `.env.example`
- `README.md` with from-scratch run instructions

## Working rules

1. **No code before a plan is presented and approved.**
2. **File by file.** After each file, explain in two lines what it does and why it
   looks that way, then stop and wait.
3. **Never add a library, tool, or folder** that isn't on the agreed list without
   asking first and explaining why.
4. Prefer the simple and understandable over the elegant.
5. **All backend code in Python only.** Do not propose Node tooling beyond what is
   required to run React.
6. Frontend React stays minimal: plain JS, no TypeScript, no UI libraries, no
   state management.
7. **All comments and documentation in plain, short English.** (Changed
   2026-09-06 from Hebrew — mixing Hebrew with English terms is hard to read in
   the editor.) Every Python function gets a comment above it: what it takes,
   what it returns, why it exists. Names in English.
8. **Update `DECISIONS.md` after every architectural decision:** the decision, the
   rejected alternatives, the reasoning.

## Approved file order (day 1)

`.gitignore`, `.env.example`, `docker-compose.yml`, `backend/requirements.txt`,
`backend/main.py`, `frontend/package.json`, `frontend/vite.config.js`,
`frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`,
`README.md`

Added on request, outside the original list (all in `DECISIONS.md`):
`DECISIONS.md`, this file, `frontend/vite.config.js`, `frontend/.env.example`,
`.gitattributes`, `db/schema.sql`, `db/seed.sql`, `backend/db.py`,
`backend/similarity.py`, `HANDOFF.md`, `backend/requirements-dev.txt`,
`backend/test_similarity.py`.

**Environment files:** two separate `.env` files — root (`POSTGRES_*`,
`DATABASE_URL`, for docker-compose + backend) and `frontend/.env`
(`VITE_API_URL` only). They share nothing. Do not merge them.

## Commands

```
docker compose up -d                              # start Postgres
cd backend && pip install -r requirements.txt     # install backend deps
cd backend && uvicorn main:app --reload           # run the API on :8000
cd frontend && npm install                        # install frontend deps
cd frontend && npm run dev                        # run the frontend on :5173
```
