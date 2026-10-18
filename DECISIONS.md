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

---

## 2026-10-10 — UI language: Hebrew interface, English code and data

**Decision:** Every user-facing string in the frontend (`frontend/index.html`, `frontend/src/App.jsx`) is in Hebrew, with `lang="he"` and `dir="rtl"` set on the page. The rationale sentences built in `backend/similarity.py` are also in Hebrew, since the user reads them directly. Everything else - variable/function names, comments, commit messages, and the values actually stored in the database (`short`, `third_limited`, `low`, etc.) - stays in English, unchanged from rule 7.

**Rejected alternative:** Also storing/writing the style-attribute values themselves in Hebrew. Rejected because it would mix the display language into the data layer: the database holds `sentence_length`/`pov`/etc. as plain English category codes, and `similarity.py` translates a value to Hebrew only at the point it builds a sentence (via `CATEGORICAL_VALUE_LABELS` and `BOOLEAN_LABELS`).

**Reasoning:** Keeping stored values in English and translating only at the display/wording layer separates data from presentation: the system is not locked into one interface language, and a future English UI (or a second language) would need to change only the wording dictionaries in `similarity.py` and the frontend strings - never touch the database or the comparison logic.

---

## 2026-10-11 — Tagging UI: `language` column, view switch without routing, manual-book placeholders

**Decision:** Three related additions for the tagging UI:
- `books.language` is a nullable `TEXT CHECK (language IN ('he', 'en'))` column. Nullable because the 15 existing seed books predate it and have no value to backfill; required instead at the form level (`BookIn.language` in `main.py`) for every new book added through `POST /books`.
- Switching between the main (search/recommendations) and tagging screens is a plain `view` state in `App.jsx` (`"main"` | `"tagging"`), toggled by two buttons - no router, no URL change.
- A book added manually through `POST /books` gets a generated `open_library_id` placeholder (`f"manual-{uuid4().hex}"`, `uuid4` from the standard library) instead of a real Open Library id, since it has no real metadata source yet.

**Rejected alternatives:**
- **`language NOT NULL`, backfilled with a guessed value.** Rejected - there is no reliable way to infer the original language of the 15 seed books from the data already stored, and guessing wrong would silently corrupt data.
- **A routing library (e.g. React Router) for the two screens.** Rejected by rule 6 (no new frontend libraries) and because two screens toggled by one piece of state need nothing a router would add.
- **Leaving `open_library_id` NULL for manual books.** Rejected because the column is `NOT NULL UNIQUE`; relaxing that constraint would weaken the guarantee for every future Open-Library-sourced row too, not just manual ones.

**Reasoning:** Each piece follows the same rule already established elsewhere in this log: nullable-with-a-reason over guessed data (same reasoning as `genre`), the simplest mechanism that satisfies "no routing" (rule 6), and a clearly-marked placeholder over weakening a constraint that protects real data (same spirit as the `seed-*` placeholder ids already in `db/seed.sql`).

---

## 2026-10-11 — Duplicate books: a case/whitespace-insensitive unique index, not app-only validation

**Decision:** `db/schema.sql` adds `CREATE UNIQUE INDEX idx_books_title_author_unique ON books (lower(trim(title)), lower(trim(author)))`. `POST /books` catches the resulting `psycopg.errors.UniqueViolation` and returns `409 {"error": "duplicate_book", ...}` instead of a raw `500`. The frontend reads that `409` explicitly and shows its own message, the same pattern already used for `recommendations`' `not_tagged` `409`.

**Rejected alternative:** Checking for an existing title+author with a `SELECT` in `main.py` before the `INSERT`, with no database constraint. Rejected because that check-then-insert has a race condition (two near-simultaneous requests can both pass the `SELECT` before either `INSERT`s) and because it protects nothing against a future direct-SQL insert - the database should be the one source of truth for "is this a duplicate," with the API layer only translating its rejection into a clean HTTP response.

**Reasoning:** `lower(trim(...))` on both columns catches the realistic near-duplicates (casing, stray whitespace) that a plain `UNIQUE (title, author)` would miss, while a real different book that happens to share a title and author is rare enough not to design around. Found and fixed before the user's planned bulk data-entry session, rather than after duplicates had already accumulated.

---

## 2026-10-13 — `GET /books` default `limit` raised to 100, no real pagination

**Decision:** The default `limit` for `GET /books` is `100` (was `20`, the existing upper bound via `le=100` is unchanged). The frontend still issues a single request with no page controls.

**Rejected alternative:** Building real pagination (a page-number/cursor state in the frontend, "next"/"previous" controls). Rejected for now - at this project's scale (~40 books today, a stated target of ~150), one request already returns the whole catalog comfortably under the existing `100` cap, so paging controls would add frontend state and UI for no real benefit yet.

**Reasoning:** The search screen was silently hiding books past the 20th result with no way to see more - not a deliberate paging UX, just a default that was too low for the catalog's actual size. Matches rule 4 (prefer simple and clear): raise the default to cover the real catalog size rather than build pagination machinery before the data volume needs it. Revisit if the catalog ever approaches the `100` cap.

---

## 2026-10-14 — `backend/schemas.py`: validation shapes shared by the API and the LLM scripts

**Decision:** `BookIn` and `StyleAttributesIn` moved out of `main.py` into a new `backend/schemas.py`, imported by both `main.py` and `llm_tagging.py`.

**Rejected alternative:** Having `llm_tagging.py` `import main` directly instead of extracting a separate module. Rejected because importing `main.py` also runs its module-level code (building the whole `FastAPI` app, registering `CORSMiddleware`) just to reach one class definition - unnecessary for a terminal script, and a confusing thing to explain.

**Reasoning:** `StyleAttributesIn` already mirrors the `CHECK` constraints in `db/schema.sql` exactly (see its original 2026-10-11 entry). Reusing the same class to validate an LLM response means there is exactly one place that defines "what counts as a valid style-attributes payload" - not two copies that could quietly drift apart.

---

## 2026-10-14 — LLM auto-tagging: official `google-genai` SDK, not raw HTTP

**Decision:** `backend/llm_tagging.py` calls the Gemini API through Google's official `google-genai` SDK (`client.models.generate_content(...)`), not a hand-written HTTP request.

**Rejected alternative:** Raw HTTP via `urllib.request` (the stdlib-only approach first proposed and the same reasoning already used elsewhere in this project to avoid a dependency, e.g. `psycopg` with raw SQL instead of an ORM). Explicitly rejected by the user for this specific case: the `psycopg`-vs-ORM choice gives up an abstraction over SQL she already knows and can be asked about in an interview; `urllib` here would mean hand-writing auth headers, response parsing, and retry/backoff logic that teaches nothing and is pure maintenance cost, for a feature she plans to run over 100+ books where transient failures (rate limits) are expected.

**Correction to the original rationale, twice over:** Part of the reasoning for the SDK was "built-in retry." The SDK's public docs/README don't mention this (checked 2026-10-14), so a first pass here added a hand-written retry loop instead. Reading the **installed package's own source** (`google.genai._api_client`, same date) found that the SDK does have a real built-in retry mechanism (`tenacity`-based, covering HTTP `408/429/5xx` *and* network-level timeouts/connection errors) - it's just **off by default** (0 retries) unless `HttpRetryOptions` is passed in. The hand-written loop was replaced with this: `genai.Client(http_options={"timeout": ..., "retry_options": {...}})`, configured once at client construction. This is strictly better than the hand-rolled version - it also covers network-level timeouts, not just HTTP status codes.

**A second, separate bug this surfaced:** no timeout was set on the Gemini call at all, so a non-responding request hung indefinitely with no error. `HttpOptions.timeout` (milliseconds) fixes this - `REQUEST_TIMEOUT_MS = 30_000` per attempt.

**Reasoning:** The SDK's typed `APIError` (with a clear `.code`) makes it easy to distinguish rate-limiting from every other failure mode, which this feature's error-handling requirements depend on.

**Version (checked 2026-10-14 against PyPI):** `google-genai==2.30.1` (requires Python ≥3.10; machine has 3.13).

**Model, first change (2026-10-14, after a real run hit a `503` "high demand" error):** switched from the `gemini-flash-latest` alias to a specific, pinned model, `gemini-3.8-flash`. Google's own docs state that alias "can be a stable, preview or experimental release" and is "hot-swapped with every new release" - i.e. it offered no guarantee of pointing at a stable model, which fits a `503` under real load.

**A note on verifying this, and a mistake in how it was first checked:** an earlier attempt to confirm `gemini-3.8-flash` was a real model name used a web-page fetch that turned out to fabricate parts of its answer (invented-looking entries like "Gemini 4 Argon" and "Nano Banana" alongside the real ones) - a tool reading a JS-rendered page can hallucinate rather than admit it can't see the content. That led to a wrong claim that the model name was probably invalid. The user then pulled the actual, current model list directly from Google's API (`GET https://generativelanguage.googleapis.com/v1beta/models`) and confirmed `gemini-3.8-flash` genuinely exists. Lesson logged here because it's a real instance of the general rule: a live API/CLI result is ground truth; a summarized fetch of a web page is not, especially for content that may be rendered client-side.

**Model, second change (2026-10-18, deliberate choice, then reverted the same day):** switched to `models/gemini-2.5-flash` - an older, established, stable model, in preference to the newer `gemini-3.8-flash` - on the reasoning that a newly-released model draws more real-world traffic and is more likely to be under heavy load (plausibly part of why `gemini-3.8-flash` returned `503`s), while this task has no need for whatever extra capability the newest model offers.

**Reverted immediately:** Google's API returned `404` for `gemini-2.5-flash` - it has been retired for new users, who are pointed explicitly at `gemini-3.8-flash` instead. Back to `models/gemini-3.8-flash`.

**The actual lesson from this round-trip:** "older and stable" does not mean "currently available" - a model can be fully retired from new-user access while still being the technically more mature one. This was learned from the API's own `404`, not from documentation or reasoning about load - the kind of fact only a real call against the live service reveals. The `models/` prefix matches the `name` field format returned by the live API list and is one of the SDK's documented accepted forms for the `model` parameter.

Pinning to a named model (rather than an alias) still means a future Google release can't silently change this script's behavior - upgrading the model is a deliberate, visible edit to `MODEL_NAME`, not something that happens underneath it.

---

## 2026-10-14 — "Unknown book" is a result, not an error; comparison script never writes

**Decision:** Two scripts, `tag_with_llm.py` (tags one book, calls `PUT /books/{id}/style-attributes`) and `compare_llm_tagging.py` (measures agreement against the 16 manually-tagged books), share `llm_tagging.py`'s `tag_book_with_llm()`. The prompt instructs Gemini to return `{"unknown_book": true}` if it isn't confident it knows the specific book; the function returns that as a normal outcome (`{"status": "unknown_book"}`), not an exception - genuine failures (`TransientServerError`, `InvalidResponseError`, `GeminiRequestError`) are raised separately. `compare_llm_tagging.py` never calls `PUT` at all - it only reads the existing manual tags and compares them against what the LLM returns in memory, so there is no mechanism by which it could overwrite manual data.

**Rejected alternatives:**
- **A separate table (e.g. `llm_style_attributes`) to persist every LLM attempt.** Rejected for now - the actual question being asked is "how much can this be trusted before filling a large catalog," not "keep a history of every model/prompt version tried." Revisit if comparing multiple models or prompt versions over time becomes a real need.
- **Treating "unknown book" as an exception.** Rejected because it's an expected, valid outcome the prompt explicitly asks for, not a failure - raising it as an exception would make the normal "the model correctly declined to guess" path look identical to a real error in every caller's error handling.

**Reasoning:** Not persisting the comparison run's output is the simplest possible way to guarantee manual tags are never touched - there's no overwrite path to protect against if nothing is ever written. Treating "unknown" as data instead of control flow keeps `tag_with_llm.py` and `compare_llm_tagging.py`'s error handling focused only on things that are actually wrong (rate limits, malformed JSON, API failures).

---

## 2026-10-14 — Measuring numeric agreement: exact match and "within ±1", reported separately

**Decision:** `compare_llm_tagging.py` reports two percentages for each of the four 1-5 numeric attributes - exact match, and "within ±1" - rather than a single number. The three categorical attributes and three boolean attributes are reported as exact match only.

**Rejected alternative:** Exact match only, for every attribute. Rejected because on a 1-5 scale, a one-point miss is a minor disagreement, not a failure - collapsing "off by one" and "off by four" into the same "wrong" bucket would make an LLM that is consistently close look exactly as unreliable as one that is wildly inconsistent, which is precisely the distinction this feature exists to surface before committing to auto-tagging ~150 books.

**Reasoning:** Categorical and boolean attributes have no natural notion of "close" (e.g. there's no partial credit between `first` and `third_omniscient` POV), so exact match is the only meaningful measure there - mirrors how `similarity.py` already treats these attribute types (distance is 0 or 1, never in between).

---

## 2026-10-18 — `compare_llm_tagging.py`: one bad book never stops the run; retries made visible

**Decision:** Added after the scripts already existed, once a 35+ book run made the risk concrete. Two changes:
- In the per-book loop, only `TransientServerError`, `InvalidResponseError`, `GeminiRequestError`, and an `unknown_book` result are caught and skipped (counted separately, printed, and the loop continues) - a failure fetching the book list itself from the local API still stops the script immediately, since that points at the server being broken for every book, not one bad book.
- `logging.basicConfig(level=logging.INFO, ...)` is set in both `compare_llm_tagging.py` and `tag_with_llm.py`. The SDK's retry mechanism (see the `google-genai` SDK entry above) already logs a "retrying in N seconds" message via `tenacity.before_sleep_log` - it's just silent by default because nothing configures Python's `logging` module. One line surfaces it, so a book being retried after a `503` prints visible activity instead of looking identical to a hang.

**Rejected alternative:** A hand-written progress indicator (e.g. a spinner or periodic "still working..." print) during the blocking Gemini call. Rejected because the SDK already emits exactly the right message at exactly the right moment (each retry attempt) - writing a separate mechanism would either duplicate that information or require threading to interleave with a call we don't control the internals of.

**Reasoning:** At the scale this is meant to run at (35+ books, growing toward ~150), a single book the model doesn't recognize or that hits a persistent transient error is an expected, not exceptional, event - the run's value is the aggregate agreement numbers, which a single bad book shouldn't be able to zero out entirely.

---

## 2026-10-18 — `compare_llm_tagging.py` persists progress after every book; `--report-only` reprints without calling Gemini

**Decision:** After every single book (not just at the end), `compare_llm_tagging.py` writes its accumulated `results`/`skipped`/`total_books` to `backend/llm_comparison_results.json` (gitignored - it's a local run's output, not source). `--report-only` loads that file and reprints the same percentage report with zero Gemini calls. `Ctrl+C` during a run is caught and still prints whatever was compared before stopping, instead of losing it to an unhandled `KeyboardInterrupt`.

**What prompted this:** A real run hit Gemini's free-tier daily quota (20 requests/day) after 19 of 36 books. The aggregate percentages existed only in local variables inside the loop, printed once at the very end - so when the run stopped, there was no way to recover them, not even from the terminal transcript saved via `Tee-Object`, because the per-book print statements never included the comparison details (only "done"/"skipped"), only the final summary did.

**Rejected alternative:** Printing the per-book comparison detail inline (so a saved terminal transcript would be self-sufficient), instead of a separate results file. Rejected because reconstructing percentages by re-parsing printed text is more fragile than reading them back as the data they actually are; a JSON file also makes `--report-only` a clean, direct feature rather than a parsing exercise.

**Reasoning:** `print_report()` recomputes every percentage from the raw per-book `manual_attributes`/`llm_attributes` pairs each time it's called (whether from a live run or a reloaded file), rather than trusting separately-maintained running counters that could drift from the raw data - one source of truth for the numbers either way.

---

## 2026-10-18 — Hebrew titles garbled in `Tee-Object` output: a display issue, verified, not a data issue

**Decision:** Both LLM scripts call `sys.stdout.reconfigure(encoding="utf-8")` at startup, so stdout is UTF-8 whether it's a real console or a redirected pipe.

**What was actually checked (not assumed):** A Hebrew book title was fetched straight from the API and inspected directly - its Unicode code points (e.g. `0x5d0`, `0x5e0`...) and its UTF-8 byte encoding were both correct Hebrew, independent of any terminal. This confirms the string in memory - and therefore whatever the SDK sends to Gemini over HTTPS as UTF-8 JSON - was never corrupted. The garbling the user saw was reproduced separately: Python's `sys.stdout.encoding`, when stdout is not an interactive console (exactly the case for `| Tee-Object`), is not guaranteed to be UTF-8 on Windows - it can fall back to a different encoding depending on the environment, independently of the data being piped through it.

**Reasoning:** Forcing UTF-8 on `stdout` removes the ambiguity regardless of console vs. pipe, so both the live terminal output and anything saved via `Tee-Object`/redirection use one known encoding. Live *display* legibility in the PowerShell window itself can still depend on the console's own configured encoding (e.g. `chcp 65001`) - outside what a Python script controls - but the saved file's bytes are now correct either way.
