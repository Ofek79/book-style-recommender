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

---

## 2026-10-19 — `books.title_original`: fixes Hebrew-title `unknown_book` false negatives

**Decision:** Added a nullable `title_original` column to `books`. Optional on the add-book form and in `BookIn`; when present, `llm_tagging.build_prompt()` includes it as an extra line telling the model this is a translated edition and naming the original title.

**What prompted this:** `EVALUATION.md`'s first run found all 7 `unknown_book` results were Hebrew-titled books (0 of 29 compared books were), including **קרבת דם** by הרלן קובן (Harlan Coben) - a well-known author the model should recognize, just not necessarily under a Hebrew translated title it may never have seen paired with that author's name. Giving the model the original title directly addresses the actual observed failure mode, rather than guessing at a fix.

**Rejected alternative:** Asking the model to translate/guess the original title itself, instead of storing and supplying it. Rejected because it reintroduces the exact problem being solved - if the model could reliably infer the original title from a Hebrew one, it would already have recognized the book without help.

**Reasoning:** Nullable and optional for the same reason `genre`/`language` are - most books (anything not a translation) never need it, and existing rows predate the column. Same migration pattern as `language`: `db/schema.sql` updated for future clean installs, `ALTER TABLE` run manually against the live database.

---

## 2026-10-19 — `is_nonlinear` prompt wording tightened: alternating POV is not nonlinear

**Decision:** `llm_tagging.py`'s prompt now explicitly says alternating point of view between short chapters is **not** `is_nonlinear` by itself - only a timeline told out of chronological order (flashbacks interrupting the main story, starting near the end and explaining how it got there, multiple distinct eras) counts.

**What the data showed:** `is_nonlinear` had 45% overall agreement in `EVALUATION.md`'s first run - worse than guessing on a binary attribute. Splitting by language found the real pattern: English-titled books agreed 76% of the time; Hebrew-titled books agreed **0/12**, and in 10 of those 12, the model said `true` where the manual tag said `false`. The Hebrew catalog is mostly commercial thrillers (Harlan Coben, Steve Cavanagh, Alex Michaelides) that commonly alternate short chapters between characters' POVs in otherwise chronological order - exactly the structure the old wording ("parallel storylines") was ambiguous enough to let the model read as "nonlinear." The two books both tagger and model agreed were `true` (*Slaughterhouse-Five*, *One Hundred Years of Solitude*) are genuinely timeline-scrambled literary novels, not POV-alternating thrillers - confirming the manual tagging's actual working definition was narrower than the old prompt wording implied.

**Rejected alternative:** Leaving the manual tagging's definition unquestioned and assuming the model is simply unreliable on this attribute. Rejected because the mismatch wasn't random noise (which would show up roughly evenly across languages/genres) - it was fully concentrated in one structural pattern (POV alternation in chronological order), which is a prompt-wording problem, not a capability problem.

**Reasoning:** The fix targets the specific, evidenced failure mode (confusing POV-alternation with timeline-reordering) rather than a general reminder to "try harder" - the kind of change that should be checked against a fresh run of `compare_llm_tagging.py` rather than assumed to have worked.

---

## 2026-10-19 — Evaluation methodology: a single `compare_llm_tagging.py` run is noisy; use 2-3 runs and a range

**Decision:** A single run's per-attribute percentage from `compare_llm_tagging.py` is treated as a rough estimate, not a precise score. See `EVALUATION.md`'s "Non-determinism finding" and "Methodology note" for the full evidence and the standing recommendation (run 2-3 times, look at the range, not one number).

**What prompted this:** Comparing two runs over the same 29-ish books found 7-15% of individual answers changed between calls on attributes whose prompt wording was never touched, plus 2 books flipping each direction between "recognized" and `unknown_book` with zero change to their data. This fully explained an apparent drop in five metrics between runs that first looked like a regression.

**Reasoning:** Treating a single run as ground truth risks reading real sampling noise as a prompt change having helped or hurt, in either direction - the fix for `is_nonlinear` happened to be large enough to stand out from that noise, but a smaller, real effect could easily be missed or misattributed without this caveat in place.

---

## 2026-10-19 — `temperature=0` for LLM tagging calls

**Decision:** `llm_tagging.py` now sets `temperature: 0` (near-deterministic, greedy decoding) on every `generate_content` call, via a named `GENERATION_TEMPERATURE` constant.

**What the default actually was, verified against the live API, not assumed:** the code never set `temperature` at all, so it ran at the model's own default. Rather than trust a remembered or guessed number, this was checked directly with `client.models.get(model="models/gemini-3.8-flash")` on 2026-10-19 (the same "verify against the live API" discipline as the model-name mixup earlier this session) - the model's documented default is **`temperature=1.0`** (also: `max_temperature=2.0`, `top_p=0.95`, `top_k=64`).

**Rejected alternative:** Leaving the default as-is and only relying on the "run 2-3 times, use a range" methodology (previous entry) to manage noise. Rejected because this is a structured classification task (10 fixed-shape fields from a title/author) with no benefit from sampling variety the way open-ended creative generation has - lower temperature is standard practice for this kind of task, and reducing the noise at its source is better than only compensating for it statistically afterward.

**Reasoning, and the limit of what this fixes:** `temperature=0` should sharply cut the 7-22% run-to-run answer drift measured in `EVALUATION.md`, but Google's own docs note it doesn't guarantee *strict* determinism (minor backend-level variation can remain) - so the multi-run methodology from the previous entry is weakened in importance, not eliminated. It also does not fix genuine miscalibration, such as `pacing`'s measured upward bias - it would make that same bias appear consistently instead of averaging out across some high and some low runs. Noise and bias are different problems; this addresses only the former.

---

## 2026-10-19 — `backend/api_client.py`: shared HTTP client for the three terminal scripts

**Decision:** `tag_with_llm.py` and `compare_llm_tagging.py`'s duplicate `urllib`-based GET/POST/PUT plumbing (`API_BASE_URL`, timeout, error handling) was pulled into a new `backend/api_client.py`, alongside two new functions needed by the upcoming bulk-add script: `find_book_by_title_author()` and `create_book()` (the latter returns `None` on a `409`, treating "this book already exists" as a normal outcome for a caller to branch on, not an error to crash on).

**Rejected alternative:** Leaving the duplication in place and writing a third copy of the same HTTP helpers directly into the new bulk-add script. Rejected once a third script needed the exact same plumbing - the same threshold already used earlier for extracting `schemas.py` out of `main.py`.

**Reasoning:** Matches rule 4 (prefer simple and clear) by having exactly one place that knows how to talk to this project's own API over HTTP, verified against the running server after the refactor (same `--report-only` output before and after, plus a live `create_book`/`find_book_by_title_author`/duplicate-`409` check against a disposable test row).

---

## 2026-10-19 — `add_books_bulk.py`: the database is the resume state, no separate progress file

**Decision:** `backend/add_books_bulk.py` reads `backend/books_to_add.json` (100 curated books, data kept separate from the script - same split as `db/seed.sql` vs. the backend code) and for each one: creates it if it doesn't exist (`create_book()`, via `api_client.py`), finds the existing row via `find_book_by_title_author()` if it does (a `409` from `create_book`), then tags it only if it isn't already tagged. A book the model doesn't recognize is still added with its metadata, just left untagged - same as adding a book through the tagging UI and not tagging it yet. Nothing aborts the whole run except the local API itself being unreachable; a single book's tagging failure is logged and skipped. Prints a final summary (created / already existed / tagged / skipped-with-reasons) since a 100-book run can't be tracked by eye.

**Rejected alternative:** A separate progress/state file (like `compare_llm_tagging.py`'s `RESULTS_PATH`) to track what's been done, so a resumed run knows what to skip. Rejected because the database already answers both questions this script needs ("does this book exist" and "is it tagged") - a second, separately-maintained record of the same facts could drift from the database and would just be re-deriving what's already there.

**Reasoning:** This makes the script safe to run repeatedly over the same list - across multiple days if a daily API quota is the limiting factor, for instance - with no special "resume" flag or state to manage: a re-run only ever does the work still left to do, verified directly (ran it against 2 real already-tagged books and confirmed zero Gemini calls were made, only the create→409→find→already-tagged→skip path).

---

## 2026-10-19 — `books.author` stays in its original (usually English) script, even when `title` is Hebrew

**Decision:** Project-wide policy, not just for this batch: `author` is never transliterated into Hebrew, regardless of what language `title` is in. For a translated book, `title` is the Hebrew edition's title, `title_original` is the work's original title, and `author` stays in the author's original-script name (e.g. "Harlan Coben", not "הרלן קובן").

**What prompted this:** Observed directly while debugging `unknown_book` results earlier in this project: changing a book's `author` field from a Hebrew transliteration to the author's original English name measurably helped Gemini recognize some books it had been missing. A Hebrew transliteration of a well-known author's name is an extra layer of indirection the model has to reverse before it can match its training data - an unnecessary obstacle to the exact recognition problem `title_original` already exists to solve.

**Rejected alternative:** Transliterating `author` to Hebrew to match the rest of a Hebrew-language catalog entry, for visual/linguistic consistency with `title`. Rejected because it actively works against LLM auto-tagging reliability for a cosmetic consistency gain - and the frontend already reads fine with an English author name next to a Hebrew title (same pattern several existing catalog entries already used).

**Reasoning:** Recognition accuracy is a bigger concern than visual uniformity on a field most users skim past - and this is a case where the two goals directly conflict, not just a case of no established convention either way.

**Applied retroactively:** `backend/books_to_add.json`'s 57 Hebrew-titled entries all keep `author` in its original script - verified directly (zero Hebrew characters found in any `author` field across the file).

---

## 2026-10-19 — Bug: `add_books_bulk.py` crashed on `KeyError: 'is_tagged'` for every newly-created book

**What happened:** `POST /books`'s response never included `is_tagged` - it's a field only `GET /books` and `GET /books/{id}` compute, via a join against `book_style_attributes` that's meaningless for a row that was just inserted. `add_books_bulk.py` treated the dict from `create_book()` (a fresh `201`) and the dict from `find_book_by_title_author()` (a `409` lookup, backed by `GET /books`) as interchangeable and read `book["is_tagged"]` on both - crashing immediately on the first newly-created book in a real run, right after that row was successfully inserted.

**Why the pre-release testing missed this:** The verification run before shipping this script only exercised 2 already-cataloged, already-tagged books - the `409`→`find_book_by_title_author` branch, where `is_tagged` genuinely exists. That was deliberately the zero-Gemini-cost path to test for free; the create-a-new-book branch (where the bug actually lived) was never exercised because doing so live would have spent real Gemini quota, and it was wrongly treated as an acceptable gap given the other two scripts' extensive existing tagging-logic tests. It should have been tested with `tag_book_with_llm` stubbed out instead, exactly as it was once the bug was found - no Gemini call was needed to catch this.

**Fix:** The `is_tagged` check now only happens in the "book already existed" branch, where the field is genuinely present. A newly created book is always untagged by construction (no `book_style_attributes` row can exist yet for an id that didn't exist a moment ago) - no check is needed there at all. Verified with a disposable new test book (the exact path that crashed before) and a stubbed `tag_book_with_llm`, so the fix could be confirmed with zero Gemini cost - plus a re-check of the already-tagged path to confirm the fix didn't regress it.

**Reasoning:** The real lesson isn't the one-line fix - it's that "zero-cost to test" and "exercises the actual new logic" are different requirements, and this script's new logic (the create-or-find branch) was exactly the part the cheap test skipped. Stubbing the LLM call (as done for the fix's own verification) gets both at once and should have been the original test's approach too.

---

## 2026-10-20 — `is_present_tense`: manual only, `NULL` (unknown) for LLM-tagged books

**Decision:** `book_style_attributes.is_present_tense` becomes nullable, and `NULL` means "unknown". The LLM no longer tags it: the attribute is removed from the prompt, and `tag_book_with_llm()` always returns `None` for it. The 100 books tagged by the bulk LLM run have their value set to `NULL`. The 36 manual tags are kept. In `similarity.py`, an attribute that is `None` on either book is left out of the score entirely (out of both the distance sum and the weight total), so the score stays a weighted average, just over the attributes both books actually have. It never appears in the rationale either. In the tagging UI, the checkbox becomes a three-option select (past / present / unknown), default "unknown".

**What prompted this:** Manually-tagged books were recommended almost only other manually-tagged books. Diagnosis traced most of that split to `is_present_tense` (and `is_nonlinear`). On the same 29 books, all 8 disagreements were manual = present, LLM = past. The tagger checked all 8 against the text: all present. A follow-up experiment showed `title_original` doesn't fix it (0/8 with it). The model recognizes the books but doesn't know their tense, and defaults to past. Full evidence in `EVALUATION.md`.

**Rejected alternatives:**
- **A sentinel value (e.g. a `TEXT` column with `'unknown'`).** Breaks the boolean type for no gain. `NULL` is SQL's standard way of saying "no known value".
- **Deriving "unknown" from who tagged the row (`tagged_by = 'llm'`, next entry) instead of storing `NULL`.** It would hard-code "LLM rows never have a tense" into the similarity logic, and wouldn't cover a manual tagger who genuinely doesn't know. `NULL` describes the value itself.
- **Dropping the attribute entirely.** Throws away 36 manual values that are correct.
- **Rewording the prompt.** Wording can't give the model knowledge it doesn't have. The experiment showed the failure persists even when the model recognizes the book.
- **Scoring an unknown attribute as a neutral 0.5 distance.** Puts an invented number into every affected score, and is harder to explain than simply not counting what isn't known.
- **Keeping the checkbox in the UI.** A checkbox has only two states, checked and unchecked - it can't show "unknown", so it can't have "unknown" as its default. Every book tagged without touching it would be saved as `false` (past tense), a guessed value presented as a real one. (A first draft of this entry gave a different reason - that opening an LLM-tagged book with `NULL` would show it unchecked and saving would overwrite it with `false`. That was wrong: `TaggingScreen.jsx` only lists untagged books and always starts from a blank form, so it never loads an existing row.)

**Cost accepted:** a pair involving an LLM-tagged book is now scored on 9 attributes, not 10. `is_present_tense` was a frequent source of difference, so those pairs score slightly higher than before. This is measured after implementing (see `EVALUATION.md`), not assumed.

**Reasoning:** A missing value is better than a wrong one. Wrong values were actively distorting recommendations along tagger lines. "Unknown" removes the distortion without pretending to know something nobody measured. Default "unknown" in the UI keeps the same rule for manual tagging: forgetting to choose leaves a gap, not a false value.

---

## 2026-10-20 — `book_style_attributes.tagged_by`: who tagged the row is stored on the row

**Decision:** New column `tagged_by TEXT NOT NULL CHECK (tagged_by IN ('manual', 'llm'))`, with no default. It is a required field in a new `StyleAttributesPut` model, which extends `StyleAttributesIn` and is used only as the body of `PUT /books/{id}/style-attributes`, so every `PUT` must say who is tagging: the tagging UI sends `'manual'`, `tag_with_llm.py` and `add_books_bulk.py` send `'llm'`. Existing rows are backfilled once: the 100 books from `backend/books_to_add.json` get `'llm'`, the other 36 get `'manual'`. `db/seed.sql` sets `'manual'` for its rows. `compare_llm_tagging.py` now compares only `tagged_by = 'manual'` books, and pages through `GET /books` with `offset` instead of a single `limit=100` call, which silently stopped at the first 100 books once the catalog grew to 136.

**What prompted this:** `compare_llm_tagging.py` measures the LLM against manual tags, but it compared every tagged book. After the bulk run, that meant comparing LLM-tagged books against the LLM's own earlier output - a measurement of nothing. Diagnosing the recommendation split (previous entry) also needed to know which books were manual, and the only way was matching titles against `books_to_add.json` by hand.

**Rejected alternatives:**
- **Exclude books listed in `books_to_add.json` from the comparison.** Derives a fact about a row from an external file. A book tagged later through `tag_with_llm.py` isn't in that file, so it would be counted as manual and the measurement would break silently.
- **Infer from `is_present_tense IS NULL`.** The UI default is now "unknown", so manual rows can be `NULL` too.
- **Infer from `tagged_at` (everything after the bulk run is LLM).** Breaks the moment either kind of tagging happens again.
- **Adding `tagged_by` directly to `StyleAttributesIn`.** That model also validates Gemini's response in `llm_tagging.py`, which has no `tagged_by` and shouldn't - so every LLM response would fail validation unless the value were injected first. `compare_llm_tagging.py` also builds its list of attributes to compare from `StyleAttributesIn.model_fields`, so `tagged_by` would show up as a "style attribute" with 0% agreement. `StyleAttributesIn` stays exactly the 10 style attributes; who tagged them is request metadata, added only where a request is made.
- **A `DEFAULT 'manual'` on the column.** A script that forgets to send the field would be silently recorded as manual - the same silent failure this column exists to prevent. Required with no default makes a forgotten value a `422`, not wrong data.

**Note on semantics:** `tagged_by` records who saved the row last. Saving a book from the tagging UI marks the whole row `'manual'`, even if some values started as LLM output - saving through the form means all 10 values were seen and accepted.

**Reasoning:** Who tagged a book is a fact about that row, so it belongs on the row - same principle as tagging status being derived from the join and not from a separate flag (2026-09-11). It makes the comparison set correct for future books too, and can be checked directly with SQL.

---

## 2026-10-22 — `GET /books` callers page with `offset` (revisits the 2026-10-13 entry)

**Decision:** Every caller that needs more than one page of `GET /books` - the search screen (`App.jsx`), the untagged list (`TaggingScreen.jsx`) and `compare_llm_tagging.py` - now loops over `offset` in pages of 100 (the API's `le=100` cap) until a page comes back short. The API itself is unchanged.

**What prompted this:** The 2026-10-13 entry raised the default `limit` to 100 and said "revisit if the catalog ever approaches the 100 cap". The bulk run took the catalog to 136. Every one-call `?limit=100` caller silently stopped at the 100th book - in `compare_llm_tagging.py` this cut 36 books out of the comparison set, and on the two screens a book past the 100th (in title order) could never be found or tagged.

**Rejected alternatives:**
- **Raising the API's `le=100` cap.** Moves the same silent cutoff to a bigger number - the next catalog growth breaks it again.
- **Real pagination UI ("next" / "previous").** The 2026-10-13 reasoning still holds: at ~150 books, loading everything in a few requests is fine, and page controls would add frontend state for no real benefit.

**Reasoning:** The loop is a few lines, works at any catalog size, and is the same pattern in all three places - one thing to understand, not three.

---

## 2026-10-22 — Reader ratings: a separate `book_ratings` table, 1:1 with `books`

**Decision:** A 1-5 star rating and an optional free-text note per book, stored in a new table:
`book_ratings (book_id INTEGER PRIMARY KEY REFERENCES books (id) ON DELETE CASCADE, rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5), note TEXT, rated_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
- A book counts as rated if and only if a row exists - no `is_rated` flag, same principle as tagging (2026-09-11).
- Any book can be rated, tagged or not. Rating and tagging are independent facts.
- `PUT /books/{id}/rating` saves or replaces the rating (`ON CONFLICT`, like style attributes), `404` if the book doesn't exist. Validated by a new `RatingIn` model in `schemas.py`. A blank or whitespace-only note is stored as `NULL`, so "no note" has one form, not two.
- `GET /books/{id}` always includes a `rating` key: `null`, or `{rating, note, rated_at}`.
- Each item from `GET /books/{id}/recommendations` gets `book.rating`: `null`, or `{rating, note}`.
- UI: a rating form (5 radio buttons + a note box) in the selected book's section of the main screen, pre-filled when the book is already rated. Each recommendation shows the rating as plain-text stars (★★☆☆☆) with the note, or nothing if unrated. No library.
- No delete endpoint, no length limit on `note`, and no rating in search results - not needed yet.

**Rejected alternatives:**
- **`rating` / `note` columns on `books`.** Most books will never be rated, so most rows would carry two `NULL`s. And "is this book rated" would become "is this column non-null" instead of "does a row exist" - a different rule from tagging for the same kind of fact.
- **A history table (many ratings per book).** Every read would need a "latest rating per book" query, for a need nobody has stated.
- **A `user_id` column now.** Users and login are out of scope. When they come, the change is known: add `user_id` and make the primary key `(user_id, book_id)`. Adding it now would mean a column with one fixed value and nothing to check it against.
- **Leaving `rating` out of `GET /books/{id}` for unrated books** (like `style_attributes`, which is only present when tagged). The frontend would have to check whether the key exists before reading it. Always present, sometimes `null`, is simpler to use. This is knowingly inconsistent with `style_attributes`, which is left as it is rather than changing a working response shape.
- **`DELETE /books/{id}/rating`.** A rating can be changed but not removed. Deleting it would also need `DELETE` added to the CORS allow-list. Add both if the need actually comes up.

**Reasoning:** Same shape as `book_style_attributes`, so nothing new to explain: a 1:1 extension table where the row's existence is the fact.

---

## 2026-10-22 — Ratings don't affect similarity or ranking (for now)

**Decision:** A rating is shown next to a recommendation but has no effect on its score or position. `similarity.py` is unchanged. A book rated 1 star appears exactly where it would appear unrated - not hidden, not moved down, not removed.

**Rejected alternatives:**
- **Hiding or demoting low-rated books.** The product recommends by writing style. "I disliked this book" is a different signal from "this book's style isn't similar", and mixing them in silently would make a recommendation's score mean two things at once and its rationale incomplete.
- **Learning attribute weights from ratings now.** A handful of ratings is noise, the same reason the weights started equal (2026-09-11). Revisit after about 20 ratings.

**Reasoning:** Keeps the score explainable: the score is style similarity, and the rating is shown next to it as separate information for the reader to weigh.

---

## 2026-10-22 — Frontend split into `src/components/`, plus `src/api.js`; refactor before redesign

**Decision:** `App.jsx` (about 330 lines, and growing with the redesign) is split into one file per component under a new `frontend/src/components/` folder. `App.jsx` keeps only the screen switch. `TaggingScreen.jsx` moves into `components/` too, since it's a screen like `MainScreen`. A new `src/api.js` holds `API_URL`, `PAGE_SIZE` and `fetchAllPages(path)` - the `offset` loop that was written out twice (search and the untagged list). The split is done first, as a pure refactor with no visual change, and committed on its own. The redesign comes after, on the new structure.

**Rejected alternatives:**
- **Keeping one `App.jsx`.** Every component and its CSS would land in one file that's hard to navigate and hard to explain piece by piece.
- **Splitting and redesigning in one step.** If something breaks, it's unclear whether the split or the new styles caused it. Two commits keep each diff reviewable on its own.
- **Leaving the `offset` loop duplicated.** Two copies of the same paging logic can drift apart - the same reason `api_client.py` was extracted on the backend (2026-10-19).

**Reasoning:** One component per file is the standard React layout a reviewer expects. It makes each piece small enough to defend line by line, and gives each component an obvious home for its own CSS.

---

## 2026-10-22 — Styling: plain CSS, a shared `base.css` plus one CSS file per component

**Decision:** Plain CSS files, imported by Vite with no library. `src/styles/base.css` holds the design tokens (CSS custom properties for colors, spacing, fonts, radius), a minimal reset, base typography, and shared styles for buttons, inputs and focus. Each component gets a CSS file next to it (e.g. `BookCard.css`), with BEM-style class names prefixed by the component (`book-card`, `book-card__title`). All layout uses logical properties (`margin-inline-start`, `padding-inline`, `text-align: start`), never `left`/`right`, so direction comes from `dir="rtl"`. Titles and author names are wrapped in `<bdi>` so English text inside a Hebrew page keeps its own direction.

**Rejected alternatives:**
- **CSS Modules.** Built into Vite and scope class names automatically, but add a concept to explain (`styles.card`). At about a dozen components, a name prefix avoids collisions just as well.
- **One big stylesheet.** It would reach around 500 lines with no clear owner for each rule.
- **Inline `style` props.** No `:hover`, `:focus-visible` or media queries.
- **A UI or CSS framework (Tailwind, a component kit).** Excluded by rule 6.

**Accessibility baseline:** text contrast checked against WCAG AA (4.5:1 for normal text), a visible `:focus-visible` outline on every interactive element, everything reachable by keyboard through native `button` / `a` / `input` elements, and animation turned off under `prefers-reduced-motion`.

---

## 2026-10-22 — Fonts: David Libre + Assistant, loaded from Google Fonts

**Decision:** Headings in David Libre (a digital revival of David, the classic Hebrew serif of books and newspapers), weight 700 only. Body text in Assistant (a clean, very readable Hebrew sans-serif), weights 400 / 600 / 700. Both also cover Latin, so English titles match. Loaded with a `<link>` to Google Fonts in `index.html`, with system fallbacks (`"David", serif` / `"Segoe UI", sans-serif`) so the page still reads if the fonts don't load. The main heading is sized with `clamp(2.25rem, 5vw, 3.25rem)` so it stands out at any width.

**How it was chosen (changed the same day):** The first pick was Frank Ruhl Libre. Once it was on screen, the user didn't like it and found the main heading not prominent enough. Three alternatives were compared side by side in a throwaway preview page: Noto Serif Hebrew (modern, heaviest, many weights), Suez One (vintage display face, one weight), and David Libre (most traditional and bookish, but quietest). The user chose David Libre. It's the least bold of the three, which is why the main heading was also made larger.

**Rejected alternatives:**
- **Frank Ruhl Libre** - didn't look right in use.
- **Noto Serif Hebrew / Suez One** - compared and not chosen.
- **Self-hosting the font files** in `public/fonts/` with `@font-face`. No external request and works offline, but adds binary files and a folder. The user chose Google Fonts: simpler, and the site doesn't need to work offline.

**Cost accepted:** one request to an external service on page load.

---

## 2026-10-22 — Colors: a tonal scale, dark shades only for text and small accents

**Decision:** The palette is a scale of shades of the same two hues plus warm neutrals, defined as tokens in `base.css`:
- green 50 / 100 / 300 / 600 / 800
- red 50 / 300 / 700
- neutrals: paper `#FDFBF7`, white, border, ink-muted, ink

The rule: **dark shades (green-600/800, red-700, ink) only for text and small accents** (headings, the primary button, stars, links, focus, error text). **Light shades (50-300) for backgrounds, borders and decoration.** Every shade used for text passes WCAG AA (4.5:1) on every background it's used on - the lowest pair is green-600 on green-50, 5.3:1. Shades 50-300 never carry text, so they have no contrast requirement.

Applied to the specific elements:
- the header band is green-50 (very light), with the title as the only dark thing in it
- the recommendation card's spine is a thin 3px line in red-300
- section headings have no underline
- list markers are green-300
- a ❦ fleuron in red-300 separates sections

**What prompted this:** The first version used only one shade per color (one dark green, one dark red, one cream). With nothing in between, every colored element was equally loud - the colors fought each other and there was no hierarchy. The one element that worked was the "93% התאמה" tag, a light green fill with dark green text - the pattern this scale generalizes. The background was also changed from cream (`#F6EFE0`) to a much lighter off-white, on the user's request.

**Rejected alternatives:**
- **A dark green header band** ("leather binding") - the most dominant thing on screen, competing with the content.
- **A 5px dark red card spine** - too heavy for what is a decorative edge.
- **A red underline under section headings** - redundant once headings have their own weight.
- **Red list markers** - loud on every rationale line.
- **Adding new colors** for variety. More hues would make the fighting worse. More shades of the same two keep the identity and add hierarchy.

**Reasoning:** Hierarchy comes from contrast between dark and light, not from more color. When only headings, the main button and small accents are dark, the eye goes to what matters first, and the rest of the page recedes.

---

## 2026-10-22 — Rationale sentences: natural reader language, no numbers, varied openings

**Decision:** The rationale sentences in `similarity.py` are rewritten in plain Hebrew, the way a reader would say it to a friend. The algorithm is unchanged - same distances, same score, same 3 closest attributes. Only the wording changed.
- **No numbers and no system terms.** "טון (3)" or "יחס דיאלוג" mean nothing to a reader. Each value has its own words instead, e.g. tone 1-5 runs from "קלילים ומשעשעים" to "אפלים וכבדים", and dialogue is about "שיחות בין הדמויות".
- **Every sentence compares two books:** the one the reader picked, and the recommended one on the card ("כאן"). `describe_attribute(name, value_a, value_b)` takes the picked book first - the order matters, and `main.py` passes it that way.
- **Equal values** get one full sentence per value, in `SAME_VALUE_SENTENCES`.
- **Different values on an ordered attribute** (sentence length, description, dialogue, tone, pacing, vocabulary) get one comparative sentence about the recommended book: "הקצב כאן מהיר יותר.", "כאן יש פחות תיאורים מבספר שבחרת." The two text-valued ones are ordered by `TEXT_VALUE_ORDER` (short < medium < long, low < medium < high), not by string comparison.
- **pov** (no order) says both sides: "הספר שבחרת מסופר בגוף ראשון, וזה על ידי מספר שיודע הכול." A different boolean is worded from the recommended book's side.
- **Varied openings.** The four attributes that dominate rationales each open differently: sentence length "המשפטים... כמו בספר שבחרת", dialogue "גם כאן...", description "שני הספרים...", pov "בשניהם...". So a card's three lines never all start the same way.

**How the four were picked:** By counting, not guessing. Across all 680 top-5 recommendations in the 136-book catalog: dialogue appears in 92% of rationales, sentence length in 89%, description in 60%, pov in 47%, and every other attribute in 6% or less.

**What prompted this:** The user found the old sentences written in the system's language, not a reader's: "שני הספרים בינוני ביחס דיאלוג" is a metric name with a value plugged in. "שני הספרים קצר באורך משפטים" is ungrammatical, because a template filled with an adjective doesn't agree in Hebrew. A first rewrite still started every sentence with "בשניהם", which read like a report.

**Rejected alternatives:**
- **One template for every attribute ("בשניהם X").** Simple to code, but three identical openings in a row read like generated output.
- **A separate "similar" sentence for a one-step gap** (the old "טון דומה (3 לעומת 5)"). A comparative ("מהיר יותר") is true for any gap size, so one rule covers close and far differences, with no threshold to define.
- **Keeping the numbers next to the words.** The 1-5 scale is an internal tagging tool. A reader has no reference for what "3" means.

**Tests:** `test_similarity.py` locks the exact wording, so 6 tests were updated with the new sentences, and one test was added for "more" / "less" ordering (20 tests total). The "never in rationale" test now compares whole sentences, not a keyword, since "זמן" also appears in pacing and plot-structure sentences.

**Noticed while counting, not changed:** 49% of rationales name the same three attributes (sentence length, description, dialogue). When several attributes tie at distance 0, `build_rationale` keeps them in `WEIGHTS` order, and those are the first entries in that dict. So the rationale is correct but may not highlight what's most distinctive about a match (e.g. two books that both have humor). Not investigated further - a separate question.

---

## 2026-10-22 — Book view replaces the results; browser Back via the History API, no router

**Decision:** Picking a book on the main screen switches it into a "book view" that replaces the results list (book detail, rating, genre filter, recommendations, and a "חזרה לתוצאות" button). The search box stays at the top in both views, and a new search leaves the book view. Search results and the search term are kept in `MainScreen` state, which stays mounted, so going back shows the same results with no new request - for an empty search (the whole catalog) and a specific one alike. The book view is its own component, `BookView.jsx`.

Browser Back works with the History API, with no library:
- picking a book calls `history.pushState({ bookId }, "")`, which adds a history entry without reloading the page or changing the URL
- Back fires a `popstate` event. `MainScreen` listens for it in a `useEffect` (added on mount, removed in its cleanup) and returns to the results.
- the "חזרה לתוצאות" button calls `history.back()`, so the on-page button and the browser button take exactly the same path, and history can't get out of sync
- `history.scrollRestoration = "manual"`: the scroll position in the list is saved before opening a book and restored after going back. The browser's automatic restore runs before React re-renders the list, so it can't be relied on.

The view switches immediately on click, with a loading message until the book's details arrive, and an error message if that request fails (it used to fail silently).

**What prompted this:** With 136 books in the list, the book detail and recommendations rendered below it, far out of sight. A click looked like it did nothing, even though both requests returned 200. And since the whole site was one history entry, Back left the site entirely.

**Rejected alternatives:**
- **React Router.** A new library (rule 6), and for two views within one screen it adds nothing `pushState` doesn't.
- **Hash routing** (`#book/36` + `hashchange`). Also library-free, but changes the URL for about the same amount of code.
- **Switching views without touching history.** Fixes the scrolling, but Back would still leave the site.

**Known limit, accepted:** the URL doesn't change, so reloading while in a book view returns to the start screen, and a specific book can't be linked to. A `?book=<id>` URL read on page load would fix both, but nobody asked for it yet.

**Extended 2026-10-25 - book-to-book navigation:** A recommended book's title is a button that opens that book's own view, through the same `openBook` as a search result. Every opened book gets its own history entry, so Back steps back one book at a time (B → A → results), and the on-page button is now just "→ חזרה", since the previous step may be a book, not the results. Three adjustments came with it:
- **Scroll:** the results' scroll position is saved only when a book is opened from the results. Otherwise opening B from A would overwrite it, and the final step back would land in the wrong place. Back to a previous book opens it at the top. Restoring the exact spot in A's recommendations would mean waiting for them to reload before scrolling - more code for a small gain.
- **Depth in history state:** each entry stores `{ bookId, depth }`, where depth is how many books deep it is. A new search from inside a book jumps straight to the results entry with `history.go(-depth)`. A single `history.back()` would land on the previous book after book-to-book browsing.
- **Only the title is clickable, not the whole card.** The card also holds the bookstore link, and a link nested inside a button is invalid HTML that breaks keyboard and screen-reader use.

The genre filter stays as set when moving between books.

**Extended 2026-10-25 - "home" is the base history entry:** The first history entry is always the main screen's base view - the home screen ("how it works", example books) before any search, the results after one - and Back from it leaves the site. Two changes keep it that way:
- **Example books open directly, without a visible search.** Before, clicking one ran a normal search (filling the search box and storing a one-book result list), then opened the book. One click made two moves (home → results → book) but recorded only one history entry (the book). So Back landed on a search the user never made, and one more Back left the site. Now the click still looks up the book's id through the same title search, but doesn't store the results or fill the search box, so Back from the book returns to the clean home screen. If the lookup fails or finds no exact match, it falls back to a visible search.
- **The site title ("Book-A-Like") is a button back home.** It jumps back to the base entry with `history.go(-depth)` (as a new search does - the books stay reachable with Forward), clears the search, and scrolls to the top. From the tagging tab it switches to the main screen, which opens on home anyway. App sends the request as a counter (`homeRequest`), not a boolean, so every click counts as a new request.
- Searches now use the same latest-request counter as recommendations, so a search still in flight can't refill the home screen after the title was clicked.

---

## 2026-10-25 — Screen transitions: one CSS entrance animation, re-run with a React key

**Decision:** Every change of view uses the same entrance: the new view fades in and rises 8px over 0.3s (`.view-transition` in `base.css`). That covers home, results, opening a book, moving to another book, going back, going home, switching tabs, and a book's content replacing its loading message. A CSS animation runs when an element is first rendered, so each view wrapper gets a React `key` that names the view (`book-<id>`, `"home"`, `"results"`, or the tab name). When the key changes, React builds a new element and the animation runs again. The search box sits outside the animated wrapper, so it stays still while the view under it changes. Under `prefers-reduced-motion`, the existing rule in `base.css` cuts it to an instant change.

**What prompted this:** Views swapped instantly, which felt abrupt. Going home from the site title had no motion at all - the page just jumped.

**Rejected alternatives:**
- **An animation library (e.g. Framer Motion).** A new library (rule 6). It could also animate the old view out, but an entrance alone already removes the jump.
- **The browser's View Transitions API (`document.startViewTransition`).** No library, and it can cross-fade old and new. But it has to wrap each state change in a callback, which adds a new concept to every place that changes the view. Newer browser support also varies.
- **Animating `opacity` with a CSS transition on a class toggle.** Needs extra state for "leaving" and "entering" and timing between them. A key plus an entrance animation needs neither.

**Cost accepted:** a view is rebuilt when its key changes, so anything held only in that view's components resets. The screens' real state lives in `MainScreen` and `App`, above the keyed wrappers, so nothing is lost - search results, the open book and the genre filter all survive.

---

## 2026-10-22 — Star rating input: hidden radio buttons styled as stars; score shown as a percentage

**Decision:** The clickable stars in the rating form are five real radio inputs, visually hidden, each with a `<label>` drawn as a star. Recommendations show the similarity score as a percentage ("93% התאמה") instead of a 0-1 decimal. The API still returns the decimal - the conversion is display only.

**Rejected alternative (stars):** `<span>` stars with `onClick`. Arrow-key navigation, Tab order, and screen-reader wording ("3 of 5") would all have to be rebuilt by hand with ARIA attributes. Radio inputs already provide all of it. Only the look changes.

**Reasoning (percentage):** "93% התאמה" reads at a glance. "0.925" needs knowing the scale. Sorting still happens on the full-precision score on the server (2026-09-12), so this changes nothing but the label.

---

## 2026-10-25 — Deployment: GCP with Cloud Run, Cloud SQL, Secret Manager and Firebase Hosting

**Decision:** The project is deployed to Google Cloud in two sessions: first local preparation (code and a tested container), then the cloud setup.
- **Backend:** FastAPI in a container on **Cloud Run**, built from a `Dockerfile` in `backend/` with `gcloud run deploy --source` (Cloud Build + Artifact Registry). `uvicorn` listens on the `$PORT` Cloud Run provides.
- **Database:** **Cloud SQL for PostgreSQL 16** - the same major version as local (`postgres:16`, 16.15). Cloud Run connects through the Cloud SQL connector's Unix socket, so `db.py` doesn't change, only the value of `DATABASE_URL` (`postgresql://user:pass@/dbname?host=/cloudsql/<connection-name>`).
- **Secrets:** the database password lives in **Secret Manager** and reaches Cloud Run as an environment variable - never in code, the image, or a command line. `GEMINI_API_KEY` is not deployed at all: the API server never calls Gemini, and the tagging scripts keep running locally.
- **Frontend:** the Vite production build on **Firebase Hosting** (free tier, HTTPS, a `<project>.web.app` address). `VITE_API_URL` is set in a new `frontend/.env.production` and baked in at build time, so changing it means rebuilding.
- **CORS:** the allowed origins move from a hardcoded list in `main.py` to an environment variable, defaulting to `http://localhost:5173` for local use. In production it holds the Firebase Hosting address.
- **Still open, decided in session 2:** the region (`me-west1` Tel Aviv or `europe-west1`, after checking Cloud SQL availability and price), and whether to stop the Cloud SQL instance between demos to save cost (estimated at roughly $7-10/month, not yet verified).

**Exception to rule 5, approved by the user:** Firebase Hosting needs the `firebase-tools` CLI, a Node tool. Rule 5 limits Node tooling to what's needed to run React. The user approved this one tool for deploying the frontend. It's installed on the machine, not added to the project's `package.json`.

**Rejected alternatives:**
- **A Compute Engine VM running docker-compose.** The closest to local, but the VM, its OS updates, HTTPS and Postgres backups would all be manual work.
- **Postgres on a free-tier e2-micro VM** instead of Cloud SQL. Saves the monthly cost, but backups, upgrades and recovery become manual work - too much for a first deployment.
- **A non-GCP database (Neon, Supabase).** Free tiers exist, but the goal is a deployment on one cloud, and it would add a second provider's account and network path.
- **Serving the frontend from FastAPI (`StaticFiles`).** One service and no CORS, but it ties the two deployments together. Two separately deployed parts is what the separate `.env` files and CORS decisions were designed around (2026-09-06).
- **Cloud Storage as a static site.** Needs only `gcloud`, but gives a long `storage.googleapis.com/<bucket>/index.html` address and needs a relative Vite `base`.
- **A second Cloud Run service with nginx** for the frontend. Another Dockerfile and service to maintain for static files.

**Reasoning:** Managed services for everything that needs care - the database above all. The local architecture carries over almost unchanged: one container for the API, one Postgres, static files for the frontend.

---

## 2026-10-25 — Public deployment is read-only; writes stay local

**Decision:** The deployed site is read-only. A `READ_ONLY` environment variable on the backend makes every write endpoint (`POST /books`, `PUT /books/{id}/style-attributes`, `PUT /books/{id}/rating`) return `403` without touching the database. The production frontend hides the tagging tab and the rating form. Locally, `READ_ONLY` is unset, and everything works as before.

**The backend is the real guard; the frontend only tidies the UI.** Hiding buttons protects nothing - anyone can send a `PUT` with `curl`. The frontend's flag only avoids showing controls that would fail anyway. If the two ever disagree, the backend still refuses.

**What prompted this:** There are no users or login (out of scope - see the ratings entry). On a public URL, anyone could add books, change tags, or rewrite ratings. And under the data decision below, anything written in the cloud would be lost at the next data refresh anyway.

**Rejected alternatives:**
- **A shared secret in a header for writes.** The secret would have to live in the frontend bundle to be usable from the site, where anyone can read it. Not real protection, just a more complicated open door.
- **Real authentication.** The right long-term answer, but users and login were explicitly put out of scope.
- **Leaving writes open.** The data could be changed by anyone, and changes would be silently wiped at the next refresh.

---

## 2026-10-25 — Local database is the source of truth; the cloud is a refreshed copy

**Decision:** Tagging and rating keep happening locally. The Cloud SQL database is a copy, filled and later refreshed by a full dump and restore:
- `pg_dump --no-owner --no-acl`, run inside the local database container, to a file outside the repo (it holds all the data)
- restored into Cloud SQL with `psql` through the Cloud SQL Auth Proxy
- `--no-owner --no-acl` because the local user `book_user` doesn't exist in Cloud SQL, and the dump shouldn't try to hand objects to it
- `db/schema.sql` and `db/seed.sql` are **not** run in the cloud. The dump creates the tables itself, and the seed rows would collide with the real ones.
- Checked after every restore: row counts in all three tables, `tagged_by` split (36 manual / 100 LLM at the time of writing), and one Hebrew title.

A refresh **replaces** the cloud data. That's safe only because nothing is ever written there - which is what the read-only decision above guarantees.

**Rejected alternatives:**
- **Working directly against the cloud database** through the Auth Proxy (the local tagging screen and scripts writing to Cloud SQL). One source of truth, but every local test would touch the live data.
- **Two-way sync.** Real complexity (conflicts, ordering) for a single-user project.
- **`gcloud sql import` from a Cloud Storage bucket** for the restore. Works without the proxy, but adds an upload step and bucket permissions. The proxy is needed anyway to check the data afterwards, and shows errors line by line.

**Reasoning:** One clear direction for data - local to cloud - with a simple, repeatable way to refresh it, and the read-only site guaranteeing that a refresh never loses anything.
