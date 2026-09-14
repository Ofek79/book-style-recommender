# Book Style Recommender

A book recommendation engine that suggests books by **how they're written**,
not by genre or topic. Search for a book and get back other books with a
similar writing style — sentence length, pacing, point of view, tone, and so
on — even when they sit in a completely different genre. Genre is shown as
metadata and can optionally filter results, but it never drives the
recommendation itself (see `DECISIONS.md`). Every recommendation comes back
with a plain-English rationale (which attributes made it match) and a link to
look the book up in a bookstore.

> **Status:** day 3 of a 3-day build (3-week break starts now - see
> `HANDOFF.md`). The backend works end-to-end against a seeded database; the
> frontend is still the day-1 skeleton. Full detail in [Status](#status)
> below.

## How this was built

This project was built with Claude Code as a coding assistant, under working
rules set before any code was written:

- A plan had to be presented and approved before implementation.
- Files were approved one at a time - no jumping ahead to the next file.
- No new dependency without a stated justification.
- Every architectural decision is recorded in `DECISIONS.md`, including the
  alternatives that were rejected and why.

Every line was reviewed before it went into the repo. `DECISIONS.md` is the
record of the reasoning behind this codebase, not just its current state.

## Stack

- Backend: Python + FastAPI
- Database: PostgreSQL (via Docker)
- Frontend: React (plain JavaScript) built with Vite
- Testing: pytest (backend only, dev dependency)

## Architecture — how a request flows

The browser loads the React app from Vite (`http://localhost:5173`). React
calls the backend at `VITE_API_URL` (`http://localhost:8000`) using `fetch`.
FastAPI handles the request; for `/books*` routes it opens a `psycopg`
connection (via `backend/db.py`) and queries PostgreSQL, and for
recommendations it also runs `backend/similarity.py` over the results before
responding. FastAPI returns JSON; React reads it and renders it on the page.
The frontend has not been updated past `/health` yet (see `HANDOFF.md`), so
today this flow is only exercised through `/docs` or `curl`.

## Setup (from scratch)

### Prerequisites

- Docker Desktop (for the database)
- Python 3.11+
- Node.js 22.12+ (the machine this was built on has Node 24)

### 1. Environment files

There are **two separate `.env` files** - the backend and frontend never
share environment variables (see `DECISIONS.md`).

Backend + database, at the repo root:

```bash
cp .env.example .env
```

Then edit `.env` and set a real `POSTGRES_PASSWORD`. Update the password in
`DATABASE_URL` to match.

Frontend, inside `frontend/`:

```bash
cp frontend/.env.example frontend/.env
```

The default `VITE_API_URL` already points at the local backend; no edit needed.

### 2. Database

```bash
docker compose up -d
```

Starts PostgreSQL on `localhost:5432`. **On the container's first-ever start**
(empty data volume), Postgres also runs `db/schema.sql` then `db/seed.sql`
automatically, creating the tables and loading 15 demo books (14 tagged with
style attributes, 1 left untagged on purpose - see `DECISIONS.md`). Data then
persists in a named Docker volume between runs.

If you edit `db/schema.sql` or `db/seed.sql` and need them to run again, wipe
the volume first:

```bash
docker compose down -v
docker compose up -d
```

`down -v` also removes all data, so use it only in development.

### 3. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs on `http://localhost:8000`. Check it:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

Full interactive docs (try every endpoint from the browser): `http://localhost:8000/docs`.

### 4. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The page should show **Backend health: ok**.

## Testing

```bash
cd backend
pip install -r requirements-dev.txt   # pulls in requirements.txt too
pytest
```

Covers `similarity.py` (pure Python, no database needed) - 12 tests: the
per-attribute distance rules, the exact rationale wording, and end-to-end
checks including a regression test tied to the real seed data (see
`DECISIONS.md`). The FastAPI endpoints themselves are currently verified
manually through `/docs` (see [API](#api) below) - no automated tests for the
database-backed routes yet.

## API

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Liveness check. |
| `GET` | `/books?search=&limit=&offset=` | Search books by title/author prefix (case-insensitive). `search` empty returns the whole catalog, paginated. |
| `GET` | `/books/{id}` | One book's metadata, plus its style attributes if it has been tagged. `404` if the id doesn't exist. |
| `GET` | `/books/{id}/recommendations?genre=&limit=` | The most style-similar tagged books to `{id}`, each with a `similarity_score`, a `rationale` (plain-English reasons), and a `bookstore_search_url`. `genre` is `any` (default), `same`, or `different` - it never affects the score, only which candidates are considered (see `DECISIONS.md`). `404` if `{id}` doesn't exist, `409` if it exists but has no style attributes yet. |

Example:

```bash
curl "http://localhost:8000/books/1/recommendations?limit=3"
```

## Status

Day 3 of a 3-day build, then a 3-week break. See `HANDOFF.md` for full detail
and the suggested order for picking this back up.

**Works, and manually or automatically verified:**
- `/health`, `/books` search, `/books/{id}`, `/books/{id}/recommendations` -
  checked via `/docs`, including the `404` / `409` / `422` failure paths
- The similarity function - 12 automated tests (see Testing)
- Seeded database - 15 real books, 14 tagged with style attributes, 1
  deliberately left untagged as a test case

**Not built yet:**
- Frontend still only calls `/health` - no search or recommendations UI
- No admin tagging endpoint or UI (`PUT /books/{id}/style-attributes` is
  designed in the API contract, not implemented)
- No real Open Library integration - all metadata is hand-seeded with
  placeholder ids and no cover images
- Similarity weights are an equal-weight v1 baseline, not yet tuned - needs
  close to the full ~150 tagged books and a real test set first
- No automated tests for the FastAPI endpoints themselves, only for
  `similarity.py`

## Ports

| Service    | URL                     |
| ---------- | ----------------------- |
| Frontend   | http://localhost:5173   |
| Backend    | http://localhost:8000   |
| PostgreSQL | localhost:5432          |

## Project layout

```
backend/                 FastAPI server
  main.py                app + /health, /books, /books/{id}, /books/{id}/recommendations
  db.py                  opens a psycopg connection from DATABASE_URL
  similarity.py          the style-similarity function (pure Python, no DB access)
  test_similarity.py     tests for similarity.py (pytest)
  requirements.txt       runtime dependencies
  requirements-dev.txt   + pytest, for running tests
db/                 database setup, run automatically by docker-compose on first start
  schema.sql        table definitions (books, book_style_attributes)
  seed.sql          15 demo books (14 tagged, 1 deliberately untagged)
frontend/           Vite + React app
  index.html        Vite entry HTML
  vite.config.js    Vite + React plugin config
  src/main.jsx      mounts React
  src/App.jsx       calls /health, shows the result (not yet updated to the new endpoints)
  .env.example      frontend env template (VITE_API_URL only)
docker-compose.yml  PostgreSQL, seeded from db/ on first start
.env.example        backend + database env template
DECISIONS.md        architecture decision log
HANDOFF.md          project state and next steps, written ahead of the 3-week break
```
