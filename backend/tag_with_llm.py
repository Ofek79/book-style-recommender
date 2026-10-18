"""
CLI script: tags one book's style attributes using an LLM (Gemini), then
saves them through the existing PUT /books/{id}/style-attributes
endpoint. The API server must already be running. Run from backend/:

    python tag_with_llm.py <book_id>

Talks to the API over HTTP like any other client (not the database
directly), so saving goes through the exact same validation and
duplicate-safe upsert logic the tagging UI uses.
"""

import json
import logging
import sys
import urllib.error
import urllib.request

from llm_tagging import GeminiRequestError, InvalidResponseError, TransientServerError, tag_book_with_llm

# Force UTF-8 regardless of whether stdout is a real console or a pipe
# - see DECISIONS.md and compare_llm_tagging.py for why this matters
# for Hebrew titles specifically.
sys.stdout.reconfigure(encoding="utf-8")

# Surfaces the SDK's own "retrying in N seconds" messages (normally
# silent - see DECISIONS.md), so a retry shows visible activity instead
# of looking identical to a stuck script.
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

# Assumes the API server is running locally on its default port (see
# README "Ports"). Not an env var - this script only ever talks to the
# developer's own local server, never a deployed one.
API_BASE_URL = "http://localhost:8000"

# Without an explicit timeout, urlopen can hang indefinitely if the
# server isn't reachable (found by testing this script against a
# stopped server - it never raised, it just hung).
REQUEST_TIMEOUT_SECONDS = 10


# Takes a book id. Returns its title and author via GET /books/{id}.
# Exits with a clear message if the book doesn't exist or the server
# can't be reached - there's no point calling an LLM for an id that
# isn't real.
def fetch_book(book_id):
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


# Takes a book id and its validated style attributes (already checked
# against schemas.StyleAttributesIn inside tag_book_with_llm). Saves
# them via PUT /books/{id}/style-attributes - the same endpoint the
# tagging UI uses - so this script gets the exact same upsert behavior
# for free, with no separate save logic to maintain here.
def save_attributes(book_id, attributes):
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


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python tag_with_llm.py <book_id>")
    try:
        book_id = int(sys.argv[1])
    except ValueError:
        sys.exit("book_id must be an integer.")

    book = fetch_book(book_id)
    print(f"Tagging '{book['title']}' by {book['author']} with Gemini...")

    try:
        result = tag_book_with_llm(book["title"], book["author"])
    except TransientServerError as error:
        sys.exit(f"Gemini kept failing transiently: {error}")
    except InvalidResponseError as error:
        sys.exit(
            f"Invalid response from the model: {error}\n--- raw response ---\n{error.raw_response}"
        )
    except GeminiRequestError as error:
        sys.exit(f"Gemini request failed: {error}")

    if result["status"] == "unknown_book":
        print("The model does not recognize this book with confidence. Nothing was saved.")
        return

    saved = save_attributes(book_id, result["attributes"])
    print(f"Saved. tagged_at = {saved['tagged_at']}")
    for key, value in result["attributes"].items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
