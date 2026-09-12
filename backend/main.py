"""
Server entry point: the book search, book detail, and recommendations
endpoints, plus /health from day 1.
Run: uvicorn main:app --reload
"""

from typing import Literal
from urllib.parse import quote_plus

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from db import get_connection
from similarity import similarity as compute_similarity

# The application object that every endpoint is registered on and uvicorn runs.
app = FastAPI(title="Book Style Recommender API")

# Let the browser call the API from a different origin (frontend on 5173, server on 8000).
# Without this the browser blocks the request from React due to the same-origin policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    # Checks that the server is alive and responding. Takes no input.
    # Returns the dict {"status": "ok"}, which becomes JSON automatically.
    # Exists so the frontend (and monitoring tools later) can verify the server is up.
    return {"status": "ok"}


# Takes an optional search term (matched as a prefix against title and
# author - see DECISIONS.md on why prefix, not substring), plus limit and
# offset for paging. Returns a list of book summaries with a derived
# is_tagged flag (true iff a book_style_attributes row exists for it).
# Exists as the main entry point of the app: searching for a book.
@app.get("/books")
def list_books(
    search: str = "",
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    with get_connection() as conn, conn.cursor() as cur:
        if search:
            cur.execute(
                """
                SELECT b.id, b.title, b.author, b.genre, b.cover_url,
                       (bsa.book_id IS NOT NULL) AS is_tagged
                FROM books b
                LEFT JOIN book_style_attributes bsa ON bsa.book_id = b.id
                WHERE b.title ILIKE %(pattern)s OR b.author ILIKE %(pattern)s
                ORDER BY b.title
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {"pattern": f"{search}%", "limit": limit, "offset": offset},
            )
        else:
            cur.execute(
                """
                SELECT b.id, b.title, b.author, b.genre, b.cover_url,
                       (bsa.book_id IS NOT NULL) AS is_tagged
                FROM books b
                LEFT JOIN book_style_attributes bsa ON bsa.book_id = b.id
                ORDER BY b.title
                LIMIT %(limit)s OFFSET %(offset)s
                """,
                {"limit": limit, "offset": offset},
            )
        return cur.fetchall()


# Takes a book id from the path. Returns the book's metadata plus
# is_tagged, and its style_attributes when is_tagged is true. 404 if no
# book has this id. Exists so a single book can be looked up by id, e.g.
# from a search result, before requesting its recommendations.
@app.get("/books/{book_id}")
def get_book(book_id: int):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, title, author, genre, cover_url, open_library_id, created_at
            FROM books WHERE id = %(book_id)s
            """,
            {"book_id": book_id},
        )
        book = cur.fetchone()
        if book is None:
            raise HTTPException(status_code=404, detail="Book not found")

        cur.execute(
            """
            SELECT sentence_length, description_density, dialogue_ratio, pov,
                   is_present_tense, tone, pacing, vocabulary_complexity,
                   is_nonlinear, has_humor, tagged_at
            FROM book_style_attributes WHERE book_id = %(book_id)s
            """,
            {"book_id": book_id},
        )
        style_attributes = cur.fetchone()

    book["is_tagged"] = style_attributes is not None
    if style_attributes is not None:
        book["style_attributes"] = style_attributes
    return book


# Takes a book's title and author. Returns a URL that searches for the
# book in a bookstore. Kept as its own small function so switching the
# target later (e.g. to a different bookstore) means changing only this
# function, nothing that calls it.
def build_bookstore_search_url(title: str, author: str) -> str:
    query = quote_plus(f"{title} {author}")
    return f"https://www.google.com/search?q={query}"


# Takes a book id from the path, an optional genre filter (any/same/
# different - "any" is the default, see DECISIONS.md), and a limit.
# Returns the `limit` most style-similar tagged books to it, each with a
# similarity score, a rationale, and a bookstore search link. 404 if the
# book does not exist. 409 if it exists but has no style attributes yet -
# there is nothing to compare against. Exists as the core recommendation
# endpoint of the product.
@app.get("/books/{book_id}/recommendations")
def get_recommendations(
    book_id: int,
    genre: Literal["any", "same", "different"] = "any",
    limit: int = Query(default=5, ge=1, le=100),
):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM books WHERE id = %(book_id)s", {"book_id": book_id})
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Book not found")

        cur.execute(
            """
            SELECT b.genre, bsa.sentence_length, bsa.description_density, bsa.dialogue_ratio,
                   bsa.pov, bsa.is_present_tense, bsa.tone, bsa.pacing,
                   bsa.vocabulary_complexity, bsa.is_nonlinear, bsa.has_humor
            FROM books b
            JOIN book_style_attributes bsa ON bsa.book_id = b.id
            WHERE b.id = %(book_id)s
            """,
            {"book_id": book_id},
        )
        query_book = cur.fetchone()
        if query_book is None:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "not_tagged",
                    "message": "This book has no style attributes yet, so there is nothing to compare against.",
                },
            )

        candidate_columns = """
            SELECT b.id, b.title, b.author, b.genre, b.cover_url,
                   bsa.sentence_length, bsa.description_density, bsa.dialogue_ratio,
                   bsa.pov, bsa.is_present_tense, bsa.tone, bsa.pacing,
                   bsa.vocabulary_complexity, bsa.is_nonlinear, bsa.has_humor
            FROM books b
            JOIN book_style_attributes bsa ON bsa.book_id = b.id
        """
        if genre == "same":
            cur.execute(
                candidate_columns + "WHERE b.id != %(book_id)s AND b.genre = %(genre)s",
                {"book_id": book_id, "genre": query_book["genre"]},
            )
        elif genre == "different":
            cur.execute(
                candidate_columns + "WHERE b.id != %(book_id)s AND b.genre IS DISTINCT FROM %(genre)s",
                {"book_id": book_id, "genre": query_book["genre"]},
            )
        else:
            cur.execute(
                candidate_columns + "WHERE b.id != %(book_id)s",
                {"book_id": book_id},
            )
        candidates = cur.fetchall()

    scored = []
    for candidate in candidates:
        score, rationale = compute_similarity(query_book, candidate)
        scored.append((score, rationale, candidate))
    # Sort on the full-precision score so two close books don't tie and
    # sort randomly; rounding happens only below, in the response.
    scored.sort(key=lambda item: item[0], reverse=True)

    return [
        {
            "book": {
                "id": candidate["id"],
                "title": candidate["title"],
                "author": candidate["author"],
                "genre": candidate["genre"],
                "cover_url": candidate["cover_url"],
            },
            "similarity_score": round(score, 3),
            "rationale": rationale,
            "bookstore_search_url": build_bookstore_search_url(candidate["title"], candidate["author"]),
        }
        for score, rationale, candidate in scored[:limit]
    ]
