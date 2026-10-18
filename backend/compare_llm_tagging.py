"""
CLI script: measures how well Gemini's auto-tagging agrees with the
existing manually-tagged books. Never writes to the database - it only
reads already-tagged books and compares the LLM's guess in memory (see
DECISIONS.md on why that's enough to guarantee manual tags are never
touched). It does persist its own progress to RESULTS_PATH after every
book, so a run that stops partway (quota exhausted, Ctrl+C, a crash)
never loses what it already compared. The API server must already be
running. Run from backend/:

    python compare_llm_tagging.py              # run (or resume reporting on) the comparison
    python compare_llm_tagging.py --report-only # reprint the last saved results, no Gemini calls
"""

import argparse
import json
import logging
import sys
import urllib.error
import urllib.request

from llm_tagging import GeminiRequestError, InvalidResponseError, TransientServerError, tag_book_with_llm
from schemas import StyleAttributesIn

# Force UTF-8 regardless of whether stdout is a real console or a pipe
# (e.g. PowerShell's `| Tee-Object`) - Windows can otherwise pick a
# different encoding for a redirected stream, garbling Hebrew titles in
# the terminal/saved file. The underlying string data is correct either
# way (verified against the API directly) - this only affects display.
sys.stdout.reconfigure(encoding="utf-8")

# Surfaces the SDK's own "retrying in N seconds" messages (normally
# silent - see DECISIONS.md), so a book being retried shows visible
# activity instead of looking identical to a stuck script.
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

API_BASE_URL = "http://localhost:8000"
REQUEST_TIMEOUT_SECONDS = 10

# Where per-book results are saved after every book (see module
# docstring) - lets a later `--report-only` run reprint the same report
# without calling Gemini again.
RESULTS_PATH = "llm_comparison_results.json"

# The four 1-5 attributes get a second "within ±1" metric alongside
# exact match; the rest only have exact match (see DECISIONS.md on why).
NUMERIC_ATTRIBUTES = {"description_density", "tone", "pacing", "vocabulary_complexity"}
# Fixed, deterministic order for both comparing and printing - same
# field order schemas.StyleAttributesIn already defines.
ATTRIBUTE_NAMES = list(StyleAttributesIn.model_fields.keys())


# Takes nothing. Returns every currently-tagged book's id, title,
# author, and manual style_attributes - via GET /books to find which
# ones are tagged, then GET /books/{id} for each one's attributes.
# Exists so the comparison set always matches whatever the API
# currently considers "tagged", rather than a separately-maintained list.
def fetch_tagged_books():
    try:
        with urllib.request.urlopen(
            f"{API_BASE_URL}/books?limit=100", timeout=REQUEST_TIMEOUT_SECONDS
        ) as response:
            summaries = json.load(response)
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach the API server at {API_BASE_URL}: {error.reason}")

    tagged_books = []
    for summary in summaries:
        if not summary["is_tagged"]:
            continue
        try:
            with urllib.request.urlopen(
                f"{API_BASE_URL}/books/{summary['id']}", timeout=REQUEST_TIMEOUT_SECONDS
            ) as response:
                tagged_books.append(json.load(response))
        except (urllib.error.HTTPError, urllib.error.URLError) as error:
            # Unlike a single book failing the LLM call, the local API
            # itself failing mid-run points at a real server problem,
            # not something to skip past - every other book would
            # likely fail the same way.
            sys.exit(f"GET /books/{summary['id']} failed: {error}")
    return tagged_books


# Takes one attribute's manual value, its LLM-produced value, and the
# attribute's name. Returns (exact_match, within_one) - within_one is
# only ever True/False for the four numeric attributes and None for
# every categorical/boolean one, so "closeness" can never silently leak
# into a metric that's only supposed to mean exact match.
def compare_attribute(manual_value, llm_value, name):
    exact_match = manual_value == llm_value
    within_one = abs(manual_value - llm_value) <= 1 if name in NUMERIC_ATTRIBUTES else None
    return exact_match, within_one


# Takes the progress saved so far (total_books, results, skipped) and
# writes it to RESULTS_PATH. Called after every single book - not just
# at the end - so a run that stops early for any reason (quota
# exhausted, Ctrl+C, a crash) leaves a file --report-only can still
# read.
def save_progress(total_books, results, skipped):
    with open(RESULTS_PATH, "w", encoding="utf-8") as file:
        json.dump(
            {"total_books": total_books, "results": results, "skipped": skipped},
            file,
            ensure_ascii=False,
            indent=2,
        )


# Takes nothing. Returns the progress previously saved by save_progress.
# Exits with a clear message if no saved run exists yet.
def load_progress():
    try:
        with open(RESULTS_PATH, encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        sys.exit(f"No saved results at {RESULTS_PATH} yet - run without --report-only first.")


# Takes the saved/accumulated total_books, results (each a dict with
# title, author, manual_attributes, llm_attributes), and skipped list.
# Prints the per-attribute agreement report. Recomputes every
# percentage from the raw per-book values each time it's called, rather
# than trusting separately-maintained running counters, so a live run
# and a --report-only run always produce the same numbers from the same
# underlying data.
def print_report(total_books, results, skipped):
    compared = len(results)
    print(f"\nCompared {compared}/{total_books} books ({len(skipped)} skipped).")
    if skipped:
        print("Skipped:")
        for entry in skipped:
            print(f"  - {entry['title']}: {entry['reason']}")

    if compared == 0:
        print("\nNo books were successfully compared - nothing to report.")
        return

    print("\nAgreement by attribute (out of the books actually compared):")
    for name in ATTRIBUTE_NAMES:
        exact_count = 0
        within_one_count = 0
        for book_result in results:
            exact_match, within_one = compare_attribute(
                book_result["manual_attributes"][name], book_result["llm_attributes"][name], name
            )
            exact_count += exact_match
            within_one_count += bool(within_one)
        exact_percent = 100 * exact_count / compared
        if name in NUMERIC_ATTRIBUTES:
            within_one_percent = 100 * within_one_count / compared
            print(f"  {name}: {exact_percent:.0f}% exact, {within_one_percent:.0f}% within ±1")
        else:
            print(f"  {name}: {exact_percent:.0f}% exact")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Reprint the report from the last saved run, without calling Gemini again.",
    )
    args = parser.parse_args()

    if args.report_only:
        saved = load_progress()
        print_report(saved["total_books"], saved["results"], saved["skipped"])
        return

    books = fetch_tagged_books()
    print(f"Comparing LLM tagging against {len(books)} manually-tagged books.\n")

    results = []
    skipped = []
    try:
        for index, book in enumerate(books, start=1):
            print(f"[{index}/{len(books)}] {book['title']} by {book['author']} ...", flush=True)
            try:
                result = tag_book_with_llm(book["title"], book["author"])
            except (TransientServerError, InvalidResponseError, GeminiRequestError) as error:
                print(f"  skipped: {error}")
                skipped.append({"title": book["title"], "reason": str(error)})
                save_progress(len(books), results, skipped)
                continue

            if result["status"] == "unknown_book":
                print("  skipped: model does not recognize this book")
                skipped.append({"title": book["title"], "reason": "unknown_book"})
                save_progress(len(books), results, skipped)
                continue

            results.append(
                {
                    "title": book["title"],
                    "author": book["author"],
                    "manual_attributes": book["style_attributes"],
                    "llm_attributes": result["attributes"],
                }
            )
            save_progress(len(books), results, skipped)
            print("  done")
    except KeyboardInterrupt:
        print("\nInterrupted - showing results for what was compared so far.")

    print_report(len(books), results, skipped)
    print(f"\n(Saved to {RESULTS_PATH} - rerun with --report-only to reprint this without calling Gemini again.)")


if __name__ == "__main__":
    main()
