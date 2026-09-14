# Handoff — end of day 3, before the 3-week break

Written 2026-09-12, updated 2026-09-14 (test suite + README polish, no new
features). Read this first when picking the project back up. For how to run
things, see `README.md`. For why each choice was made, see `DECISIONS.md`.
For the working rules, see `CLAUDE.md`.

## What works right now

The backend is functional end-to-end against a seeded database:

- `GET /health`
- `GET /books?search=&limit=&offset=` — title/author prefix search
- `GET /books/{id}` — one book's metadata + style attributes if tagged
- `GET /books/{id}/recommendations?genre=&limit=` — style-based
  recommendations with a score, a plain-English rationale, and a bookstore
  search link

All three real endpoints were manually tested against `/docs` and confirmed
working, including the failure paths (`404` on an unknown id, `409` on an
untagged one, `422` on an out-of-range `limit` or bad `genre` value).

The database has 15 real, well-known books: 14 tagged with style attributes
(picked to include close pairs, some across different genres, so similarity
results are easy to sanity-check), plus `Brave New World` left deliberately
untagged as a test case for the `404`/`409` paths.

`similarity.py` also has an automated test suite: 12 `pytest` tests covering
the per-attribute distance rules, the exact rationale wording, and two
end-to-end checks — including a regression test locked to the real
Hemingway/McCarthy seed pair, so a future change to the formula can't
silently break the demo without a test failing. Run with
`cd backend && pip install -r requirements-dev.txt && pytest`.

## What is NOT built yet

- **Frontend still shows only `/health`.** `App.jsx` was explicitly kept out
  of scope for day 3. It needs a search box, a results list, and a
  recommendations view calling the three endpoints above.
- **No admin tagging endpoint or UI.** `PUT /books/{id}/style-attributes` was
  designed in the API contract but never implemented — tagging new books
  today means writing SQL by hand.
- **No real Open Library integration.** All book metadata is hand-seeded in
  `db/seed.sql` with placeholder `open_library_id` values and no cover
  images. Fetching real metadata is still a "later" item per `CLAUDE.md`.
- **Only 15 books, not ~150.** The similarity weights are an intentional
  equal-weight v1 baseline (see `DECISIONS.md`) — not yet tuned, because
  tuning needs a bigger, real catalog and a real test set first.
- **Bookstore link is a generic Google search**, not a specific store. Easy
  to change — it's one function, `build_bookstore_search_url` in `main.py`.
- **No automated tests for the FastAPI endpoints themselves** — only
  `similarity.py` (pure Python, no DB) has a test suite. The three real
  endpoints are verified manually through `/docs` only.

## Gotchas

Things that actually tripped things up while building this, with the
symptom and the fix, so the same debugging doesn't happen twice.

1. **Editing `schema.sql`/`seed.sql` seems to do nothing.**
   Symptom: table/data changes never show up after `docker compose up -d`.
   Cause: Postgres only runs `/docker-entrypoint-initdb.d/*.sql` on a
   **first-ever** container start (empty data volume) - if the volume from a
   previous session is still around, the scripts are skipped entirely.
   Fix: `docker compose down -v` (wipes data) then `docker compose up -d`.

2. **`ModuleNotFoundError: No module named 'psycopg'`.**
   Symptom: the error above when running the server or a script.
   Cause: the virtual environment was never activated, so `python`/`pip`
   point at a different (global) Python.
   Fix: `.venv\Scripts\Activate.ps1`. The prompt must show `(.venv)` at the
   start of the line before running anything else.

3. **`pip install` reports success, but the package still isn't found.**
   Symptom: install finishes clean, then the very next import fails anyway.
   Cause: it installed into the wrong (usually global) environment - same
   root cause as #2, different symptom.
   Fix: don't trust the install output alone. Verify from the *same*
   terminal: `pip list` (look for the package) or
   `python -c "import psycopg"` (no error = it's really there).

4. **`Could not import module "main"` from `uvicorn`.**
   Symptom: `uvicorn` fails immediately on startup with that error.
   Cause: it was run from the repo root instead of from `backend/`, so
   `main.py` isn't on the current path.
   Fix: `cd backend` first. More generally - check the end of the terminal
   prompt line (the current directory) before running any command, not
   after it fails.

5. **`curl` in PowerShell prints a security warning / behaves oddly.**
   Symptom: unexpected output or a warning instead of the plain JSON
   response shown in this README.
   Cause: PowerShell aliases `curl` to `Invoke-WebRequest`, a different tool
   with different output, not the real curl.
   Fix: call `curl.exe` explicitly to get the actual curl binary.

6. **Frontend still shows the old `VITE_API_URL` after editing `frontend/.env`.**
   Symptom: changed `frontend/.env`, refreshed the browser, nothing changed.
   Cause: there are two separate `.env` files (see `DECISIONS.md`) - Vite
   only reads `frontend/.env`, and only loads it once, at dev-server start.
   Fix: restart `npm run dev` after editing `frontend/.env`. A browser
   refresh alone is not enough.

7. **Pasting a long command into PowerShell throws confusing errors.**
   Symptom: a multi-line paste (e.g. a long `docker` or `curl` command)
   splits across two lines and PowerShell reports an unrelated-looking
   parse error.
   Cause: the terminal mis-handles the paste, not the command itself.
   Fix: if a pasted command errors strangely, retype it manually on one
   line before assuming the command is wrong.

## Suggested order for the next session

1. `App.jsx` — wire up search → book detail → recommendations, using the
   three endpoints (this was the one file cut from day 3's scope).
2. `PUT /books/{id}/style-attributes` + a minimal admin tagging UI, so more
   books can be added without hand-written SQL.
3. Start pulling real metadata from Open Library instead of hand-seeding.
4. Once the catalog is close to ~150 tagged books: build a small test set of
   "book A should recommend book B" pairs, and use it to revisit the equal
   weights in `similarity.py`.
5. Optional, lower priority: automated tests for the FastAPI endpoints
   (currently manual-only via `/docs`), once there's a real DB fixture
   strategy to decide on.
