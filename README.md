# Book Style Recommender

A book recommendation engine based on writing style. Search for a book, get
stylistically similar books, each with an explained rationale and a link to
look it up in a bookstore.

> **Status:** day 3 of the build (3-week break starts now - see
> `HANDOFF.md`). The backend is functional end-to-end against a seeded
> database: search, book detail, and style-based recommendations with a
> rationale, all reachable at `/docs`. The frontend is still the day-1
> skeleton - it only calls `/health` and does not use these endpoints yet.

## Stack

- Backend: Python + FastAPI
- Database: PostgreSQL (via Docker)
- Frontend: React (plain JavaScript) built with Vite

## Prerequisites

- Docker Desktop (for the database)
- Python 3.11+
- Node.js 22.12+ (the machine this was built on has Node 24)

## Setup

### 1. Environment files

There are two separate `.env` files - the backend and frontend never share
environment variables (see `DECISIONS.md`).

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

## Ports

| Service    | URL                     |
| ---------- | ----------------------- |
| Frontend   | http://localhost:5173   |
| Backend    | http://localhost:8000   |
| PostgreSQL | localhost:5432          |

## Architecture

The browser loads the React app from Vite (`http://localhost:5173`). React
calls the backend at `VITE_API_URL` (`http://localhost:8000`) using `fetch`.
FastAPI handles the request; for `/books*` routes it opens a `psycopg`
connection (via `backend/db.py`) and queries PostgreSQL, and for
recommendations it also runs `backend/similarity.py` over the results before
responding. FastAPI returns JSON; React reads it and renders it on the page.
The frontend has not been updated past `/health` yet (see `HANDOFF.md`), so
today this flow is only exercised through `/docs` or `curl`.

## Project layout

```
backend/            FastAPI server
  main.py           app + /health, /books, /books/{id}, /books/{id}/recommendations
  db.py             opens a psycopg connection from DATABASE_URL
  similarity.py     the style-similarity function (pure Python, no DB access)
  requirements.txt
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
