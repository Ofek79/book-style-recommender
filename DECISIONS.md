# Architecture decision log

Each decision records: the decision, the rejected alternatives, and the reasoning.

---

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
