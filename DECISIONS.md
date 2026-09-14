# Architecture decision log

Each decision records: the decision, the rejected alternatives, and the reasoning.

---

## 2026-09-06 — Line endings: LF everywhere, enforced by `.gitattributes`

**Decision:** A `.gitattributes` file with `* text=auto eol=lf` normalizes every text file to LF in the repository and on checkout, on every OS. Windows batch files (`*.bat`, `*.cmd`) are exempted to CRLF since they require it.

**Rejected alternatives:**
- **No `.gitattributes`, rely on each developer's `core.autocrlf`.** That setting is per-machine and easily misconfigured; a Windows editor saving CRLF then leaks it into commits, producing noisy diffs where every line looks changed and breaking shell scripts and Dockerfiles that expect LF.
- **`* text=auto` without `eol=lf`.** Stores LF in the repo but checks out CRLF on Windows. Fine for most files, but this project's `docker-compose.yml` and any future shell scripts run in Linux containers where CRLF causes failures. Forcing LF on checkout too keeps the working tree identical to what runs in Docker/CI.

**Reasoning:** The build is developed on Windows but the database (and later the backend) runs in Linux containers, and an interviewer may clone it on macOS or Linux. One committed policy file makes line endings deterministic for everyone and removes a whole class of "works on my machine" diffs and script failures. The cost is one small file.

## 2026-09-06 — Main branch name: `main`

**Decision:** The repo's main branch is called `main` (renamed from the `master` that git created by default).

**Rejected alternative:** `master` — git's historical default when `init.defaultBranch` is not set.

**Reasoning:** Since 2020 the industry standard moved to `main`. GitHub, GitLab, and git itself (from 2.28) support the switch, and GitHub creates every new repo with `main`. An interviewer expects to see `main`; `master` reads as dated. Also set `git config --global init.defaultBranch main` so every future repo starts right.

---

## 2026-09-06 — Two separate `.env` files: backend and frontend

**Decision:** The backend/database and the frontend each have their own `.env`.
- Repo root `.env` (+ `.env.example`): `POSTGRES_*`, `DATABASE_URL`. Read by `docker-compose` and the Python server.
- `frontend/.env` (+ `frontend/.env.example`): `VITE_API_URL` only. Read by Vite.

The frontend `.env` never contains a secret, so nothing sensitive can leak into browser code regardless of how Vite behaves.

**Rejected alternatives:**
- **One root `.env` for both, relying on the `VITE_` prefix to filter what reaches the browser.** This is filtering, not separation: the DB password sits in the same file Vite parses, and safety depends entirely on Vite honoring the prefix convention. Weaker than the frontend simply never having the secret.
- **One root `.env` for both + `envDir: ".."` in `vite.config.js`** so Vite reads the root file. Same filtering-not-separation problem, plus it only works because of a dev-tool setting. In production the frontend and backend are deployed separately with separate environment configs — two files match that reality. (Same reasoning that rejected the Vite dev proxy for CORS.)
- Frontend reading `DATABASE_URL` directly — leaks a secret into code that runs in the browser.

**Reasoning:** Anything in frontend code ends up in the bundle shipped to the browser and visible to every user. Strong separation (the secret is not in any file the frontend build touches) beats filtering (the secret is there but a prefix rule hides it). Two files also mirror how the two parts are actually deployed and configured in production. The `VITE_` prefix still matters as a second layer — it makes "this value is public" explicit at every use site — but it is no longer the thing standing between the DB password and the browser.

**Cost accepted:** two files to keep in sync instead of one. In practice they share nothing, so there is nothing to sync.

---

## 2026-09-06 — Cross-origin access: `CORSMiddleware` in the server, not a Vite proxy

**The problem:** In development the frontend runs on `http://localhost:5173` and the server on `http://localhost:8000`. These are two different origins (origin = scheme + host + port). The browser's same-origin policy blocks a `fetch` from code running on 5173 to 8000 by default, unless the server returns `Access-Control-Allow-*` headers that explicitly permit it.

**Decision:** Permit the access on the server side with FastAPI's `CORSMiddleware`, limited to the origin `http://localhost:5173` and the `GET` method only.

**Rejected alternative:** A proxy in Vite's dev server (`server.proxy` in `vite.config.js`) that forwards a path like `/api` to `localhost:8000`. That way the browser sees one origin and there is no CORS at all.
- Rejected because it only solves the problem in development. In production there is no Vite dev server, and the real cross-origin problem comes back — so we'd need CORS configured properly in the server anyway. Better to have the same mechanism in both environments.
- It also adds config to `vite.config.js`, shifting network responsibility to the Node side instead of leaving it in the Python server (rule 5).

**Why limited to one origin and GET:** The middleware's default blocks everything; you open only what is actually used. On day 1 the frontend makes one `GET` request from `localhost:5173`. `allow_origins=["*"]` would let any site on the internet call the API; opening more methods (`POST`, `DELETE`) widens the attack surface on capabilities that don't exist yet. When we add an endpoint that writes data, we'll widen the list at that moment and document it here.

---

## 2026-09-06 — Comment language: English

**Decision:** All comments and documentation in the project are written in plain, short English. This changed rule 7, which originally required Hebrew comments.

**Rejected alternative:** Hebrew comments (the original rule). Every Python function still gets a comment above it stating what it takes, what it returns, and why it exists — only the language changed.

**Reasoning:** Mixing Hebrew prose with English technical terms and code identifiers is hard to read in the editor: the line direction flips back and forth and the eye loses the thread. Uniform English keeps comments aligned with the code they describe.

---

## 2026-09-06 — Frontend build: `@vitejs/plugin-react` + `vite.config.js`

**Decision:** Use the official `@vitejs/plugin-react` plugin, configured in a small `frontend/vite.config.js`. This adds one file that was not on the original approved day-1 list.

**Rejected alternative:** Bare Vite with no plugin and no config file. Vite's esbuild would still transpile `.jsx`, but only with the classic runtime (an `import React` in every component) or extra esbuild settings, and there would be no React Fast Refresh — every edit does a full page reload and loses component state.

**Reasoning:** The plugin is the standard setup for a Vite + React project and is what a reviewer expects to see. It enables the automatic JSX runtime (no `import React` boilerplate) and Fast Refresh (edit a component, see it update in place). The cost is a single config file of about five lines that stays fully understandable. Keeping backend tooling in Python (rule 5) is unaffected — this is the frontend build, which is allowed to use Node.

**Versions (checked 2026-09-06 against the npm registry):** `react` / `react-dom` `19.2.8`, `vite` `8.2.2`, `@vitejs/plugin-react` `6.1.1`. Picked current stable rather than the year-old versions first drafted (Vite 6, plugin-react 4) — a portfolio project dated 2026 on Vite 6 would itself need explaining. `@vitejs/plugin-react` v6 dropped its Babel dependency; JSX transform and Fast Refresh now run in oxc (Rust, built into Vite 8), so `npm install` pulls fewer packages (19 total, 0 vulnerabilities). v6 requires Vite 8+ and Node `^20.19 || >=22.12`; the machine has Node 24. `package-lock.json` is committed as the real lock.

**Backend versions (checked 2026-09-06 against PyPI):** `fastapi==0.141.1`, `uvicorn[standard]==0.52.4` — current stable, same reasoning as the frontend bump. Machine has Python 3.13.

**Also decided:** `server.strictPort: true` in `vite.config.js`. If port 5173 is taken, Vite fails with an error instead of silently moving to 5174 — where the backend CORS allow-list (origin `http://localhost:5173` only) would then reject every request, which is confusing to debug.

---

## 2026-09-11 — Genre: a book field from Open Library, not a style attribute

**Decision:** Genre is stored as a plain field on the books table, populated from Open Library metadata. It is not one of the manually-tagged style attributes, and it is not an input to the similarity score itself. How it participates in recommendations (filter vs. a cross-genre toggle) is decided separately in the similarity-function discussion.

**Rejected alternatives:**
- **An 11th manually-tagged style attribute.** Rejected because genre answers "what is the book about" (content/category), while every other attribute answers "how is it written" (style) — the whole premise of this project is style-based recommendation. Folding genre into the same vector would conflate two different kinds of similarity and muddy the rationale text shown to the user.
- **Manually tagging genre like the other attributes.** Rejected as duplicate, error-prone work: Open Library already supplies genre/subject metadata for each book, so re-tagging it by hand only risks disagreeing with an external source of truth for no benefit.

**Reasoning:** Keeps the style vector purely about writing style (matches the product's stated algorithm scope in CLAUDE.md) while still keeping genre available as descriptive metadata and as a lever the recommendation logic can use explicitly and visibly, rather than silently through a tagged score.

---

## 2026-09-11 — Similarity function: weighted sum of per-attribute distances

**Decision:** The similarity score between two books is `1 - weighted average of per-attribute distances` across the 10 style attributes (numeric attributes normalized to 0-1 before differencing; categorical/boolean attributes score 0 if equal, 1 if different). Genre plays no part in this score. Genre is always shown as metadata on a recommendation, with an optional toggle to either require the same genre or require a different genre (cross-genre discovery); the default is no genre filtering at all.

**Rejected alternatives:**
- **Cosine similarity over an encoded attribute vector.** A single cosine value does not decompose cleanly back into a per-attribute rationale sentence, which conflicts with the hard product requirement that every recommendation returns with a readable rationale, not just a score.
- **Rule-based tiered points per attribute.** Maximally explainable, but requires hand-writing a scoring rule per attribute up front for little extra clarity over the weighted-distance approach, whose per-attribute distances already convert directly into rationale text.
- **Genre as a hard pre-filter on the candidate pool.** Rejected because with only ~150 books, filtering by genre first could leave very few candidates in niche genres, and it would hide the product's actual differentiator — style similarity that crosses genre lines.

**Reasoning:** Matches CLAUDE.md's stated algorithm scope (a hand-designed weighted similarity function over hand-defined style attributes, no embeddings, every recommendation with a rationale). Per-attribute distances rank naturally into "closest attributes" for the rationale text. Keeping genre out of the score but visible and optionally togglable makes it an explicit, explainable lever instead of a silent input baked into one number.

---

## 2026-09-11 — Indexes on `books.title` and `books.author`

**Decision:** Create a plain B-tree index on `books.title` and one on `books.author`, as part of the initial schema rather than added later.

**Rejected alternatives:**
- **No index, add one later if search feels slow.** Rejected because search is the app's core action (per the product description in CLAUDE.md); defining the index in the initial schema costs nothing and avoids diagnosing slow queries after the fact.
- **`pg_trgm` trigram index for fuzzy/substring search.** Rejected for now: it's a Postgres extension, which counts as a new tool under rule 3 and needs its own ask. With ~150 rows, a plain B-tree behind a prefix search (`ILIKE 'term%'`) is already fast enough. Revisit if fuzzy/substring search becomes a real requirement.

**Reasoning:** Search is the primary operation of the app; better to define the index upfront in the schema than to discover the slowness later.

---

## 2026-09-11 — Untagged books: no schema field, the join is the source of truth

**Decision:** No boolean/status column is added to mark whether a book is tagged. A book counts as tagged if and only if a matching row exists in `book_style_attributes`. Search over `books` (title/author) works independently of tagging status — an untagged book is still findable by search. An untagged book cannot act as a similarity candidate for anyone else's recommendations, and cannot itself receive recommendations, because the weighted-distance function has no attribute vector to compute with; this is enforced naturally by an `INNER JOIN` from `books` to `book_style_attributes` when building the candidate pool, so untagged books drop out with no extra filter logic. The exact response shape when a user requests recommendations for an untagged book is decided in the API contract (section 4).

**Rejected alternative:** A redundant `is_tagged` boolean column on `books`. Rejected because it could drift out of sync with whether a `book_style_attributes` row actually exists (e.g. a row gets deleted and the flag isn't updated); the join already answers the same question with no extra state to keep consistent.

**Reasoning:** Keeps tagging status single-sourced from the data instead of a denormalized flag that needs to be kept in sync — matches rule 4 (prefer simple and clear).

---

## 2026-09-11 — Database access: `psycopg` (v3), raw SQL, no ORM

**Decision:** Backend database access uses `psycopg[binary]` (psycopg 3) as the driver. Queries are written as plain SQL strings — no query builder, no ORM.

**Rejected alternatives:**
- **SQLAlchemy Core (query builder).** Replaces raw SQL strings with a Python API (`select()`, `Table()`), but that API itself needs explaining, for no real benefit over hand-written SQL on a two-table schema.
- **SQLAlchemy ORM (declarative models + session).** The most common choice in FastAPI tutorials, but adds the most moving parts to defend line-by-line in an interview (model classes, session lifecycle, lazy loading) for a schema this small.
- **`psycopg2` instead of `psycopg` (v3).** `psycopg2` is in maintenance mode; `psycopg` (v3) is its actively developed successor — same reasoning already used for picking current-stable versions elsewhere (see the frontend/backend version entry above).

**Reasoning:** Every query in the code is exactly the SQL from the schema in this file — nothing hidden behind an abstraction layer, which matches rule 4 (prefer simple and clear) and is the easiest version of this decision to defend line-by-line.

**Version (checked 2026-09-11 against PyPI):** `psycopg[binary]==3.3.5` — current stable, same reasoning as the other pinned versions in this log.

---

## 2026-09-11 — Loading `.env` into the backend process: `python-dotenv`

**Decision:** Use `python-dotenv` (`load_dotenv()`) to load the root `.env` file into `os.environ` at server startup, so `DATABASE_URL` is readable in Python. Vite does this automatically for the frontend; the Python server has no equivalent built in.

**Rejected alternative:** A hand-rolled `.env` parser (open the file, split each line on `=`, set `os.environ`). Avoids one dependency, but re-implements something `python-dotenv` already solves correctly (quoting, comments, blank lines) — more code to maintain and explain for no real benefit.

**Reasoning:** `python-dotenv` is the standard, widely-known solution to this exact problem in Python — a single well-known function call is easier to defend than a hand-rolled parser, matching rule 4.

**Version (checked 2026-09-11 against PyPI):** `python-dotenv==1.2.3` — current stable.

---

## 2026-09-11 — Equal weights for all style attributes (v1 baseline)

**Decision:** All ten style attributes start with equal weight in the similarity function (see `backend/similarity.py` — a single `WEIGHTS` dict at the top of the file, not spread through the scoring logic, so a future tuning pass edits one dict and nothing else).

**Rejected alternative:** Hand-picked custom weights per attribute from the start. Rejected for this first version — with only 14 seed books there is no real test set to justify preferring, say, pacing over tone. Assigning custom weights now would be guessing dressed up as design.

**Reasoning:** This is a deliberate, documented baseline, not an oversight: equal weights are a neutral, defensible starting point. Tuning is deferred until there are close to the full ~150 tagged books and a real test set to check whether a change actually improves recommendations, instead of tuning against noise from 14 rows.

---

## 2026-09-12 — Bookstore link: generic Google search, built by one function

**Decision:** `GET /books/{id}/recommendations` builds `bookstore_search_url` with a single function, `build_bookstore_search_url(title, author)`, currently pointing at a generic Google search (`https://www.google.com/search?q=<title> <author>`).

**Rejected alternative:** Hardcoding a specific bookstore's URL format (e.g. Amazon, Tzomet Sfarim, Steimatzky) directly in the endpoint. Rejected because it commits to one vendor's URL scheme before that choice is made, and would mean editing the endpoint itself to switch providers later.

**Reasoning:** A generic search engine query needs no vendor API or account and works for any title/author. Isolating it in one small function means swapping the target later touches one place, not the endpoint logic.

---

## 2026-09-12 — Recommendation ranking: sort on the full-precision score, round only for display

**Decision:** `GET /books/{id}/recommendations` sorts candidates by the raw similarity score from `similarity.py`, and rounds to 3 decimal places only when building the JSON response.

**Rejected alternative:** Rounding before sorting. Rejected because two genuinely different books could round to the same 3-decimal score, and sorting on the rounded value would then order them arbitrarily (by whatever order the DB happened to return them) instead of by true similarity.

**Reasoning:** Keeps the displayed number short and readable without sacrificing correct ordering.

---

## 2026-09-12 — `HANDOFF.md` added ahead of the 3-week break

**Decision:** Added `HANDOFF.md`, outside the original approved file list, to record project state before the 3-week break between day 3 and the next working session.

**Rejected alternative:** Relying on `README.md` + `DECISIONS.md` alone. Rejected because `README.md` explains how to run the current code and `DECISIONS.md` explains why past choices were made, but neither says what is still unbuilt or what to do first on return - a gap that matters specifically because of the long pause.

**Reasoning:** One dated entry point for picking the project back up, rather than reconstructing status from commit history and memory.

---

## 2026-09-14 — Testing: `pytest`, dev-only, in `backend/requirements-dev.txt`

**Decision:** Tests for `similarity.py` use `pytest`, listed in a new `backend/requirements-dev.txt` (`-r requirements.txt` + `pytest`) rather than in `requirements.txt` itself, so installing the app to run it doesn't also pull in a testing library.

**Rejected alternative:** `unittest` (Python's standard library, no new dependency). Rejected because it needs `TestCase` classes and `self.assertEqual(...)` instead of plain `assert`, and has no built-in equivalent to `@pytest.mark.parametrize` for the several small, repetitive attribute-distance cases here - more boilerplate for the same coverage, and `pytest` is what a reviewer of a Python project expects to see.

**Reasoning:** `pytest` is the de facto standard for testing Python projects, which matters for how the project reads to an interviewer, and it is dev-only cost: nothing about running the server depends on it.
