# Handoff — current project state

Rewritten 2026-10-25, deployment added 2026-10-26. It replaces the version
written 2026-09-12 / updated 2026-09-14, before the 3-week break, when there
was no frontend beyond `/health` and only 15 seed books. Read this first when
picking the project
back up. For how to run things, see `README.md`. For why each choice was
made, see `DECISIONS.md`. For how far the LLM tagging can be trusted, see
`EVALUATION.md`. For the working rules, see `CLAUDE.md`.

## What works right now

**Backend (FastAPI):**
- `GET /health`
- `GET /books` - title/author prefix search, paged with `limit` (max 100) and `offset`
- `GET /books/{id}` - metadata, style attributes (with `tagged_by`), and `rating`
- `GET /books/{id}/recommendations` - style similarity with a 3-sentence
  explanation in natural Hebrew, a bookstore link, and the book's rating.
  Optional `genre` filter (`any` / `same` / `different`).
- `POST /books`, `PUT /books/{id}/style-attributes`, `PUT /books/{id}/rating`

**Frontend (React, Hebrew, RTL, designed):**
- Home screen with "how it works" and three example books that open in one
  click
- Search results as cards
- A book view that replaces the results: one-row rating form with clickable
  stars, genre filter (with a note that it recalculates), recommendation
  cards in two columns on wide screens
- Book-to-book navigation (a recommended book's title opens its own view).
  Browser Back/Forward step through the books, then the results, then the
  home screen, via the History API (no router). The site title returns home.
- A tagging screen to add books and tag them by hand
- One shared entrance animation for every view change. Loading, error and
  empty states share one look (`StatusMessage`). Keyboard-accessible, with
  `prefers-reduced-motion` respected.

**LLM auto-tagging (terminal scripts, Gemini):** `tag_with_llm.py`,
`add_books_bulk.py`, `compare_llm_tagging.py` - see README.

**Tests:** 20 `pytest` tests on `similarity.py`. Run with
`cd backend && pip install -r requirements-dev.txt && pytest`.

## Deployment (live since 2026-10-26)

**Site:** https://book-a-like.web.app (also `book-a-like.firebaseapp.com`).
Read-only: no tagging tab, no rating form, and the API refuses writes with
`403`. Checked end to end in a browser on 2026-10-26.

**What runs where** (GCP project `book-a-like`, region `me-west1`; reasons in
`DECISIONS.md`, 2026-10-25 and 2026-10-26 entries):

| Part | Where | Name |
|---|---|---|
| API | Cloud Run | `book-a-like-api` - https://book-a-like-api-870137644140.me-west1.run.app |
| Database | Cloud SQL, Postgres 16, `db-f1-micro`, no backups | instance `book-a-like-db`, database `book_style`, user `book_user` |
| DB connection string | Secret Manager | `database-url`, version 1 |
| API runtime identity | service account | `book-a-like-api@...` - Cloud SQL Client + access to that one secret |
| Image builds | service account | `book-a-like-builder@...` - Cloud Build builder |
| Frontend | Firebase Hosting | site `book-a-like` |

**Cloud data = the local data on 2026-10-25** (136 books, 36/100
`tagged_by`, 10 ratings), checked row by row with an md5 per table against
the local database. Anything tagged or rated locally since then is not in
the cloud until the next refresh.

**Redeploy the API** (from the repo root, after a backend change):

```
gcloud run deploy book-a-like-api --source backend --region me-west1 --service-account book-a-like-api@book-a-like.iam.gserviceaccount.com --build-service-account projects/book-a-like/serviceAccounts/book-a-like-builder@book-a-like.iam.gserviceaccount.com --add-cloudsql-instances book-a-like:me-west1:book-a-like-db --set-secrets DATABASE_URL=database-url:1 --set-env-vars "^@^READ_ONLY=true@CORS_ALLOWED_ORIGINS=https://book-a-like.web.app,https://book-a-like.firebaseapp.com" --allow-unauthenticated --max-instances 2
```

**Redeploy the frontend** (from `frontend/`): `npm run build`, then
`firebase deploy --only hosting`.

**Refresh the cloud data from local** (replaces everything in the cloud):
1. `pg_dump --no-owner --no-acl` inside the local db container, to a file
   outside the repo.
2. Start the proxy: `cloud-sql-proxy --port 5433 book-a-like:me-west1:book-a-like-db`
   (5433, because local Postgres has 5432).
3. Drop the three tables in the cloud database, then restore with the local
   container's `psql` against `host.docker.internal:5433`, using
   `-v ON_ERROR_STOP=1 --single-transaction`. The password is read from the
   `database-url` secret, never typed.
4. Compare counts and per-table md5 with the local database.

Steps 3-4 were done on 2026-10-26 into an empty database, so the "drop
first" part has not been run yet - plan it before the first refresh.

## Data state

- **136 books in the working database:** 36 tagged by hand
  (`tagged_by = 'manual'`) and 100 tagged by Gemini (`tagged_by = 'llm'`).
- **`is_present_tense` is `NULL` (unknown) for all 100 LLM-tagged books.** The
  LLM was wrong 8/8 on hand-verified books, so it's no longer asked, and the
  similarity function leaves unknown attributes out (see `EVALUATION.md`).
- **Ratings** live in `book_ratings`, one row per rated book.
- **A fresh install has only the 15 seed books.** `add_books_bulk.py` can add
  the 100 curated ones (needs `GEMINI_API_KEY`; about 20 requests a day on the
  free tier). The other 21 hand-tagged books exist only in the working
  database.
- A full backup of `book_style_attributes`, taken before the 2026-10-20
  migration, was saved outside the repo. It isn't part of the project.

## Open items

Agreed and recorded, not yet done:

1. **Tie-breaking in `build_rationale` follows `WEIGHTS` order, not how
   distinctive an attribute is.** When several attributes tie at distance 0,
   `sorted()` keeps their order in the `WEIGHTS` dict, so the first entries
   (sentence length, description, dialogue) win. 49% of all rationales name
   exactly those three. The explanation is correct, but may skip what's
   actually special about a match - e.g. two books that both have humor, or
   both use second person, which few books share. A fix would break ties by
   rarity: prefer an attribute value that fewer books in the catalog share.
   Needs a plan first. It changes which sentences show, so the rationale
   tests change too. See the note at the end of the rationale entry in
   `DECISIONS.md`.
2. **Every terminal-script request to the API takes about 2 seconds.**
   `backend/api_client.py` uses `API_BASE_URL = "http://localhost:8000"`. On
   this Windows machine, `localhost` adds about 2.2s per request
   (`127.0.0.1` answers instantly - measured 2026-10-22), most likely because
   it tries IPv6 first. `compare_llm_tagging.py` makes one request per book,
   so fetching the catalog alone takes about 5 minutes. A likely fix is
   switching `API_BASE_URL` to `127.0.0.1`. One line, but check that nothing
   else depends on the name `localhost` (CORS checks the frontend's origin,
   not this). The frontend's `VITE_API_URL` also uses `localhost`. Browsers
   seemed fast, but this wasn't measured there.

3. **Whether to stop Cloud SQL between demos.** Decide once the real cost
   shows in billing (budget alert: 60 ILS). A stopped instance means the site
   fails until it's started again.

Other known gaps:

- **`is_nonlinear` has a one-way bias in LLM tags.** 10 of 12 disagreements
  in Run 3 are manual = false, LLM = true. It's the next candidate for the
  same kind of check `is_present_tense` got (`EVALUATION.md`).
- **No real Open Library integration** - placeholder ids, no covers.
- **Similarity weights are still the equal-weight baseline.** Revisit once
  there are about 20 ratings and a test set (`DECISIONS.md`).
- **No automated tests for the API endpoints.**
- **A book view has no URL** - reload returns home, and no book can be linked
  to. A `?book=<id>` URL would fix it (`DECISIONS.md`).
- **Phone testing on a real device** needs `--host` on both servers, the PC's
  IP in `frontend/.env`, and that origin added to CORS in `main.py`. Not set
  up. Use the browser's device mode (F12, then Ctrl+Shift+M) meanwhile.
- **Small leftovers:**
  - the FastAPI title in `main.py` (shown on `/docs`) still says "Book Style
    Recommender API"
  - the `GEMINI_API_KEY` comment in `.env.example` mentions two scripts; there
    are three
  - the git `user.email` is a placeholder (`הכתובת-שהעתקת`) on every commit

## Gotchas

Things that actually tripped things up, with the symptom and the fix, so the
same debugging doesn't happen twice.

1. **Editing `schema.sql`/`seed.sql` seems to do nothing.**
   Symptom: table/data changes never show up after `docker compose up -d`.
   Cause: Postgres only runs `/docker-entrypoint-initdb.d/*.sql` on a
   **first-ever** container start (empty data volume).
   Fix: `docker compose down -v` (wipes data) then `docker compose up -d`. For
   the live database, apply an `ALTER TABLE` migration by hand instead, after
   a backup (see the 2026-10-20 entries in `DECISIONS.md`).

2. **`ModuleNotFoundError: No module named 'psycopg'`.**
   Cause: the virtual environment isn't active.
   Fix: `.venv\Scripts\Activate.ps1` - the prompt must show `(.venv)`.

3. **`pip install` reports success, but the package still isn't found.**
   Cause: it went into the wrong (global) environment - same root cause as #2.
   Fix: check from the same terminal with `pip list` or
   `python -c "import psycopg"`.

4. **`Could not import module "main"` from `uvicorn`.**
   Cause: run from the repo root instead of `backend/`.
   Fix: `cd backend` first.

5. **`curl` in PowerShell behaves oddly.**
   Cause: PowerShell aliases `curl` to `Invoke-WebRequest`.
   Fix: call `curl.exe`.

6. **Frontend still uses the old `VITE_API_URL` after editing `frontend/.env`.**
   Cause: Vite reads `frontend/.env` only at dev-server start.
   Fix: restart `npm run dev`.

7. **A pasted multi-line command throws confusing errors.**
   Fix: retype it on one line before assuming the command is wrong.

8. **`git commit -m "..."` fails in Windows PowerShell 5.1 when the message
   contains quote characters** - it splits the argument at each `"`.
   Fix: keep quotes out of `-m` messages, or write the message to a file and
   use `git commit -F <file>`.

9. **A browser test shows behavior from before a code change.**
   Cause: the page wasn't reloaded with the new code. This produced a false
   bug report once (keyboard access to recommendation titles, 2026-10-25).
   Fix: hard-reload with Ctrl+Shift+R before testing a change.

10. **Back/Forward behave strangely while testing navigation.**
    Cause: history entries left over from earlier test runs in the same tab
    (each opened book adds one).
    Fix: test navigation in a fresh tab.

11. **The terminal scripts are slow.** See open item 2 - `localhost` costs
    about 2s per request on this machine.

12. **Gemini returns `429` / stops partway through a run.**
    Cause: the free tier's daily quota (about 20 requests).
    Fix: re-run the next day. `add_books_bulk.py` and
    `compare_llm_tagging.py` both resume without redoing finished work.

13. **`firebase projects:addfirebase` fails with `403 PERMISSION_DENIED`**
    even with the right account and the Owner role.
    Cause: the Firebase terms of service were never accepted, and only the
    console can accept them. The console also offered to create a new
    project (`book-a-like-602d1`) instead of using the existing one.
    Fix: add Firebase to the existing project from the console. Never create
    a second project.

14. **`gcloud run deploy --source` fails: `...-compute@developer... does not
    have storage.objects.get access`.**
    Cause: no build account given, so Cloud Build fell back to the default
    Compute account, which has no roles in this project.
    Fix: always pass `--build-service-account` (see the redeploy command
    above).

15. **A secret written from PowerShell gets a hidden line break at the end.**
    Cause: PowerShell 5.1 adds one when it pipes a string to a native
    program. Inside `DATABASE_URL` that breaks the connection.
    Fix: write secrets from Bash with `printf '%s' ... | gcloud secrets ...
    --data-file=-`.

16. **`gcloud components install` fails in a non-interactive shell**
    ("Cannot use bundled Python installation...").
    Fix: run it yourself in a normal PowerShell window.

17. **The first request to the live site takes a few seconds.**
    Cause: Cloud Run scales to zero (`min-instances` 0), so it has to start a
    container first. Not an error.

## Suggested order for the next session

1. Open item 2 (`localhost` → `127.0.0.1` in `api_client.py`): small, and it
   speeds up every later script run.
2. Open item 1 (rarity-based tie-breaking in `build_rationale`) - plan first.
3. Check `is_nonlinear` the way `is_present_tense` was checked.
4. Collect about 20 ratings, then revisit the equal weights in `similarity.py`.
5. Optional: automated tests for the API endpoints, a `?book=<id>` URL, real
   Open Library metadata.
6. After a week or two of the site being live: check the real cost in
   billing and decide open item 3.
