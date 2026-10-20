"""
CLI script: adds and tags every book listed in books_to_add.json. The
API server must already be running. Run from backend/:

    python add_books_bulk.py

Safe to run multiple times (e.g. across several days, if Gemini's
daily quota runs out partway) - the database itself is the resume
state, not a separate progress file:

  - A book already in the catalog (same title+author) is never
    re-created; create_book()'s 409 handling finds it instead.
  - A book that's already tagged is left alone - no Gemini call.

So re-running this script over the same list only ever does the work
that's still left to do. A book the model doesn't recognize is still
added to the catalog with its metadata - it's just left untagged,
exactly like adding a book through the tagging UI and not tagging it
yet (see DECISIONS.md).
"""

import json
import logging
import sys

from api_client import create_book, find_book_by_title_author, save_style_attributes
from llm_tagging import GeminiRequestError, InvalidResponseError, TransientServerError, tag_book_with_llm

# Force UTF-8 regardless of whether stdout is a real console or a pipe
# - see DECISIONS.md for why this matters (most titles here are
# English, but this stays consistent with the other scripts).
sys.stdout.reconfigure(encoding="utf-8")

# Surfaces the SDK's own "retrying in N seconds" messages (normally
# silent - see DECISIONS.md), so a retry shows visible activity instead
# of looking identical to a stuck script.
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

BOOKS_FILE = "books_to_add.json"


# Takes nothing. Prints a final summary (created / already existed /
# tagged / skipped, with reasons) from the counters main() built up.
# Pulled into its own function so it can be called both at the end of
# a normal run and from the KeyboardInterrupt handler, printing the
# same report either way for whatever was actually done.
def print_summary(total, created_count, already_existed_count, tagged_count,
                   skipped_already_tagged, skipped_unknown, skipped_error):
    print("\n=== Summary ===")
    print(f"Books in list: {total}")
    print(f"Created new catalog entries: {created_count}")
    print(f"Already existed in catalog: {already_existed_count}")
    print(f"Tagged in this run: {tagged_count}")
    print(f"Skipped - already tagged: {skipped_already_tagged}")
    print(f"Skipped - model doesn't recognize (unknown_book): {len(skipped_unknown)}")
    for title in skipped_unknown:
        print(f"  - {title}")
    print(f"Skipped - error: {len(skipped_error)}")
    for entry in skipped_error:
        print(f"  - {entry['title']}: {entry['reason']}")


def main():
    with open(BOOKS_FILE, encoding="utf-8") as file:
        books = json.load(file)

    created_count = 0
    already_existed_count = 0
    tagged_count = 0
    skipped_already_tagged = 0
    skipped_unknown = []
    skipped_error = []

    try:
        for index, entry in enumerate(books, start=1):
            title, author = entry["title"], entry["author"]
            print(f"[{index}/{len(books)}] {title} by {author} ...", flush=True)

            created = create_book(
                title, author, entry["title_original"], entry["genre"], entry["language"]
            )
            if created is not None:
                # POST /books doesn't return is_tagged - it's a derived
                # field GET /books and GET /books/{id} compute via a
                # join, meaningless for a row that was just inserted.
                # A freshly created book has no book_style_attributes
                # row yet by construction, so it's always untagged -
                # no need to check anything, just move on to tagging.
                book = created
                created_count += 1
                print("  created")
            else:
                book = find_book_by_title_author(title, author)
                if book is None:
                    # The server said this title+author already exists
                    # (409) but search can't find it - something is
                    # inconsistent. Surface it loudly rather than
                    # silently skipping, unlike a normal tagging failure.
                    skipped_error.append(
                        {"title": title, "reason": "reported as duplicate but not found by search"}
                    )
                    print("  error: reported as duplicate but not found by search")
                    continue
                already_existed_count += 1
                print("  already in catalog")

                # Only a pre-existing book (found via the search-backed
                # GET /books, which does include is_tagged) can already
                # be tagged - a newly created one never reaches here.
                if book["is_tagged"]:
                    skipped_already_tagged += 1
                    print("  already tagged, skipping")
                    continue

            try:
                result = tag_book_with_llm(title, author, entry["title_original"])
            except (TransientServerError, InvalidResponseError, GeminiRequestError) as error:
                skipped_error.append({"title": title, "reason": str(error)})
                print(f"  tagging failed: {error}")
                continue

            if result["status"] == "unknown_book":
                skipped_unknown.append(title)
                print("  model does not recognize this book - added, left untagged")
                continue

            # tagged_by is added at save time, not returned by
            # tag_book_with_llm (see StyleAttributesPut in schemas.py).
            save_style_attributes(book["id"], {**result["attributes"], "tagged_by": "llm"})
            tagged_count += 1
            print("  tagged")
    except KeyboardInterrupt:
        print("\nInterrupted - showing results for what was done so far.")

    print_summary(
        len(books),
        created_count,
        already_existed_count,
        tagged_count,
        skipped_already_tagged,
        skipped_unknown,
        skipped_error,
    )


if __name__ == "__main__":
    main()
