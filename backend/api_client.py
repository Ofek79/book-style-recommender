"""
Shared HTTP client helpers for talking to this project's own API from
the terminal scripts (tag_with_llm.py, compare_llm_tagging.py,
add_books_bulk.py). Pulled out once a third script needed the same
plumbing - not used by main.py itself, since these scripts are clients
of the API, not part of it.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# Assumes the API server is running locally on its default port (see
# README "Ports"). Not an env var - these scripts only ever talk to the
# developer's own local server, never a deployed one.
API_BASE_URL = "http://localhost:8000"

# Without an explicit timeout, urlopen can hang indefinitely if the
# server isn't reachable (found by testing this against a stopped
# server - it never raised, it just hung).
REQUEST_TIMEOUT_SECONDS = 10


# Takes a book id. Returns its full record via GET /books/{id}. Exits
# with a clear message on a 404 or if the server can't be reached -
# every caller needs a real book to continue, so there's no softer
# failure mode worth returning instead.
def get_book(book_id):
    try:
        with urllib.request.urlopen(
            f"{API_BASE_URL}/books/{book_id}", timeout=REQUEST_TIMEOUT_SECONDS
        ) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            sys.exit(f"No book with id {book_id}.")
        sys.exit(f"GET /books/{book_id} failed: {error.code} {error.reason}")
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")


# Takes a limit and an offset. Returns one page of book summaries via
# GET /books. The API caps limit at 100, so a caller that needs the
# whole catalog loops over offset until a page comes back short (see
# compare_llm_tagging.py). Exists so compare_llm_tagging.py can find
# which books are currently tagged.
def list_books(limit=100, offset=0):
    try:
        with urllib.request.urlopen(
            f"{API_BASE_URL}/books?limit={limit}&offset={offset}", timeout=REQUEST_TIMEOUT_SECONDS
        ) as response:
            return json.load(response)
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")


# Takes a title and author. Returns the matching book record via
# GET /books?search=<title> (an exact title is always a prefix of
# itself, so the existing prefix search finds it), or None if no book
# with that exact title and author exists. Exists so add_books_bulk.py
# can look up a book's id after create_book returns None for a 409 -
# the duplicate-conflict response itself carries no id to use.
def find_book_by_title_author(title, author):
    query = urllib.parse.quote(title)
    try:
        with urllib.request.urlopen(
            f"{API_BASE_URL}/books?search={query}&limit=100", timeout=REQUEST_TIMEOUT_SECONDS
        ) as response:
            matches = json.load(response)
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")
    for book in matches:
        if book["title"] == title and book["author"] == author:
            return book
    return None


# Takes a new book's fields. Returns the created record via POST
# /books, or None if the server responded 409 (a book with this title
# and author already exists) - that's a normal, expected outcome for a
# caller re-running over a list that's partly already in the catalog,
# not an error to crash on.
def create_book(title, author, title_original, genre, language):
    request = urllib.request.Request(
        f"{API_BASE_URL}/books",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(
            {
                "title": title,
                "author": author,
                "title_original": title_original,
                "genre": genre,
                "language": language,
            }
        ).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 409:
            return None
        sys.exit(f"POST /books failed: {error.code} {error.reason}")
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")


# Takes a book id and its validated style attributes (already checked
# against schemas.StyleAttributesIn inside tag_book_with_llm). Saves
# them via PUT /books/{id}/style-attributes - the same endpoint the
# tagging UI uses - so every caller gets the exact same upsert behavior
# for free, with no separate save logic to maintain here.
def save_style_attributes(book_id, attributes):
    request = urllib.request.Request(
        f"{API_BASE_URL}/books/{book_id}/style-attributes",
        method="PUT",
        headers={"Content-Type": "application/json"},
        data=json.dumps(attributes).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"PUT /books/{book_id}/style-attributes failed: {error.code} {error.reason}")
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")
