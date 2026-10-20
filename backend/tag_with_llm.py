"""
CLI script: tags one book's style attributes using an LLM (Gemini), then
saves them through the existing PUT /books/{id}/style-attributes
endpoint. The API server must already be running. Run from backend/:

    python tag_with_llm.py <book_id>

Talks to the API over HTTP like any other client (not the database
directly), so saving goes through the exact same validation and
duplicate-safe upsert logic the tagging UI uses.
"""

import logging
import sys

from api_client import get_book, save_style_attributes
from llm_tagging import GeminiRequestError, InvalidResponseError, TransientServerError, tag_book_with_llm

# Force UTF-8 regardless of whether stdout is a real console or a pipe
# - see DECISIONS.md and compare_llm_tagging.py for why this matters
# for Hebrew titles specifically.
sys.stdout.reconfigure(encoding="utf-8")

# Surfaces the SDK's own "retrying in N seconds" messages (normally
# silent - see DECISIONS.md), so a retry shows visible activity instead
# of looking identical to a stuck script.
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python tag_with_llm.py <book_id>")
    try:
        book_id = int(sys.argv[1])
    except ValueError:
        sys.exit("book_id must be an integer.")

    book = get_book(book_id)
    print(f"Tagging '{book['title']}' by {book['author']} with Gemini...")

    try:
        result = tag_book_with_llm(book["title"], book["author"], book.get("title_original"))
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

    # tagged_by is request metadata, not a style attribute, so it's added
    # here at save time rather than returned by tag_book_with_llm (see
    # StyleAttributesPut in schemas.py).
    saved = save_style_attributes(book_id, {**result["attributes"], "tagged_by": "llm"})
    print(f"Saved. tagged_by = {saved['tagged_by']}, tagged_at = {saved['tagged_at']}")
    for key, value in result["attributes"].items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
