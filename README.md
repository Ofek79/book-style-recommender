# Book Style Recommender

A book recommendation engine based on writing style. Search for a book, get
stylistically similar books, each with an explained rationale and a link to
look it up in a bookstore.

> **Status:** day 1 of the build. This is an empty running skeleton - a
> `/health` endpoint and a frontend that displays its response. No
> recommendation logic yet.

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

Starts PostgreSQL on `localhost:5432`. Data persists in a named Docker volume
between runs.

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

### 4. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The page should show **Backend health: ok**.

## Ports

| Service    | URL                     |
| ---------- | ----------------------- |
| Frontend   | http://localhost:5173   |
| Backend    | http://localhost:8000   |
| PostgreSQL | localhost:5432          |

## Project layout

```
backend/          FastAPI server
  main.py         app + /health endpoint
  requirements.txt
frontend/         Vite + React app
  index.html      Vite entry HTML
  vite.config.js  Vite + React plugin config
  src/main.jsx    mounts React
  src/App.jsx     calls /health, shows the result
  .env.example    frontend env template (VITE_API_URL only)
docker-compose.yml  PostgreSQL only
.env.example      backend + database env template
DECISIONS.md      architecture decision log
```
