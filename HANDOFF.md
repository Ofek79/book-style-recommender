# Handoff — end of day 3, before the 3-week break

Written 2026-09-12. Read this first when picking the project back up. For how
to run things, see `README.md`. For why each choice was made, see
`DECISIONS.md`. For the working rules, see `CLAUDE.md`.

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

## Gotcha for next session

`docker compose up -d` only runs `db/schema.sql` and `db/seed.sql` on a
**first-ever** container start (empty data volume). If the volume from this
session is still around, your data is already there and nothing needs to
happen. If you ever change `schema.sql` or `seed.sql`, you must
`docker compose down -v` (wipes data) before `up -d` again, or the changes
are silently ignored.

## Suggested order for the next session

1. `App.jsx` — wire up search → book detail → recommendations, using the
   three endpoints (this was the one file cut from day 3's scope).
2. `PUT /books/{id}/style-attributes` + a minimal admin tagging UI, so more
   books can be added without hand-written SQL.
3. Start pulling real metadata from Open Library instead of hand-seeding.
4. Once the catalog is close to ~150 tagged books: build a small test set of
   "book A should recommend book B" pairs, and use it to revisit the equal
   weights in `similarity.py`.
