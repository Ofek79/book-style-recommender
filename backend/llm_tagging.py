"""
Shared logic for LLM-based style tagging, used by both terminal scripts:
tag_with_llm.py (tags one new book) and compare_llm_tagging.py (measures
agreement against manual tags). Not imported by main.py - the API
server never calls Gemini itself.
"""

import json
import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors
from pydantic import ValidationError

from schemas import StyleAttributesIn

# Load the root .env file so GEMINI_API_KEY is in os.environ - same
# pattern as db.py, since this module is used by standalone scripts,
# not by main.py/uvicorn.
load_dotenv()

# A specific, pinned model - not the "gemini-flash-latest" alias (which
# Google's docs describe as hot-swappable to a preview/experimental
# release at any time - checked 2026-10-14).
#
# gemini-2.5-flash was tried (an older, established model, expected to
# be under less load than a newly-released one) but Google's API
# returned 404 for it: it's no longer available to new users, who are
# pointed explicitly at gemini-3.8-flash instead. "Older and stable"
# turned out not to mean "available" - see DECISIONS.md.
MODEL_NAME = "models/gemini-3.8-flash"

# The model's own default is 1.0 (confirmed via client.models.get() on
# 2026-10-19, not assumed - see DECISIONS.md). 0 makes generation
# near-deterministic (greedy decoding: always the single most likely
# next token) instead of sampling - this is a structured classification
# task with no benefit from creative variation, and EVALUATION.md
# measured 7-22% of answers changing run to run at the default. 0
# reduces that noise; it does not fix a genuine miscalibration (e.g.
# pacing's upward bias) - it would just make that bias more consistent,
# not smaller.
GENERATION_TEMPERATURE = 0

# Per-attempt timeout, in milliseconds (the unit google.genai.types.
# HttpOptions.timeout uses). Without this, a call that never gets a
# response just hangs forever - found by testing this exact script
# against a real API key. 30s is generous for a short prompt like this.
REQUEST_TIMEOUT_MS = 30_000

# The SDK has its own built-in retry (tenacity-based, confirmed by
# reading the installed package's source on 2026-10-14) for exactly the
# status codes that matter here, plus network-level timeouts/connection
# errors - but it is OFF by default (0 retries) unless configured via
# HttpRetryOptions. ATTEMPTS below is the total including the first try
# (so 4 = 1 try + 3 retries). Codes match the SDK's own documented
# default retryable set (408/429/5xx) - no reason to narrow it.
RETRY_ATTEMPTS = 4
RETRY_INITIAL_DELAY_SECONDS = 5.0
RETRY_MAX_DELAY_SECONDS = 60.0
RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]


# Raised when Gemini keeps returning a retryable status (see
# RETRYABLE_STATUS_CODES) even after the SDK's built-in retries.
class TransientServerError(Exception):
    pass


# Raised when Gemini's response is not valid JSON, or is valid JSON but
# doesn't match the expected shape (missing/out-of-range fields). Keeps
# the raw response text so the caller can show what actually came back.
class InvalidResponseError(Exception):
    def __init__(self, message, raw_response):
        super().__init__(message)
        self.raw_response = raw_response


# Raised for any other Gemini API failure (not 429) - network issues,
# invalid API key, etc. Wraps the SDK's own error so callers only need
# to handle exceptions from this module, not reach into google.genai.
class GeminiRequestError(Exception):
    pass


# Takes a book's title and author, and optionally the work's original
# title (for a translated edition - see EVALUATION.md: Hebrew-titled
# translations were being missed as "unknown_book" when the model only
# recognized the book under its original title). Returns a plain-English
# prompt asking for 9 of the 10 style attributes as JSON, with every
# allowed value spelled out (matching StyleAttributesIn exactly), or a
# fixed "unknown book" response if the model isn't confident it knows
# this specific book. is_present_tense is deliberately not asked for -
# the model gets it wrong too often to trust (see EVALUATION.md), so
# it's tagged manually only. Exists as its own function so the prompt
# text is easy to find and edit without touching the request/parsing logic.
def build_prompt(title, author, title_original=None):
    original_title_line = (
        f'\nThis is a translated edition; the work\'s original title is "{title_original}".\n'
        if title_original
        else ""
    )
    return f"""You are analyzing the writing style of a real, published novel.

Book: "{title}" by {author}
{original_title_line}
If you are not highly confident you know this specific, real book by this
exact title and author, respond with exactly this JSON and nothing else:
{{"unknown_book": true}}

Otherwise, respond with exactly one JSON object with exactly these 9 keys
and no others:

- sentence_length: one of "short", "medium", "long" - typical sentence length in the prose.
- description_density: integer 1-5 - 1 = almost no descriptive prose (dialogue/action-driven), 5 = rich descriptive prose.
- dialogue_ratio: one of "low", "medium", "high" - how much of the text is dialogue versus narration.
- pov: one of "first", "third_limited", "third_omniscient", "second" - the narrative point of view.
- tone: integer 1-5 - 1 = light/humorous tone, 5 = dark/somber tone.
- pacing: integer 1-5 - 1 = slow and contemplative, 5 = fast-paced and event-driven.
- vocabulary_complexity: integer 1-5 - 1 = simple, plain language, 5 = complex, literary vocabulary.
- is_nonlinear: boolean - true ONLY if the underlying timeline is told out of chronological order (e.g. flashbacks that interrupt the main story, opening near/after the ending and then explaining how it got there, or multiple time periods from different eras). False if events unfold in chronological order - even if the book alternates between multiple characters' points of view or intercuts short chapters from different characters happening around the same time. Alternating POV by itself is NOT nonlinear; only a scrambled or reordered timeline is.
- has_humor: boolean - true if the book has a noticeably humorous or ironic tone.

Respond with the JSON object only - no markdown, no explanation, no code fences."""


# Takes the raw text of a Gemini response. Returns the parsed JSON as a
# dict. Raises InvalidResponseError if it isn't valid JSON. Strips
# markdown code fences defensively - response_mime_type="application/
# json" (set in tag_book_with_llm) should prevent them, but a model can
# still add them, and failing on that would defeat the point of asking
# for JSON in the first place.
def parse_json_response(raw_text):
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise InvalidResponseError(f"Response was not valid JSON: {error}", raw_text)


# Takes a book's title and author, and optionally its original title
# (see build_prompt above). Calls Gemini and returns one of two
# outcomes: {"status": "tagged", "attributes": {...}} with all 10 style
# attributes validated against the exact same rules the API enforces
# (schemas.StyleAttributesIn) - is_present_tense is always None
# ("unknown"), since the LLM isn't trusted with it - or
# {"status": "unknown_book"} if the
# model said it doesn't recognize the book. Raises TransientServerError,
# InvalidResponseError, or GeminiRequestError on failure - see the
# exception classes above for what each means. This is the one function
# both CLI scripts call; neither talks to Gemini directly.
def tag_book_with_llm(title, author, title_original=None):
    client = genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options={
            "timeout": REQUEST_TIMEOUT_MS,
            "retry_options": {
                "attempts": RETRY_ATTEMPTS,
                "initial_delay": RETRY_INITIAL_DELAY_SECONDS,
                "max_delay": RETRY_MAX_DELAY_SECONDS,
                "http_status_codes": RETRYABLE_STATUS_CODES,
            },
        },
    )
    prompt = build_prompt(title, author, title_original)

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config={"response_mime_type": "application/json", "temperature": GENERATION_TEMPERATURE},
        )
    except errors.APIError as error:
        # The SDK already retried internally (see RETRY_ATTEMPTS above)
        # before this exception reached here, so getting here means
        # either the status isn't retryable at all, or it is and every
        # retry still failed.
        if error.code in RETRYABLE_STATUS_CODES:
            raise TransientServerError(
                f"Still failing with status {error.code} after {RETRY_ATTEMPTS} attempts: {error.message}"
            )
        raise GeminiRequestError(f"Gemini request failed ({error.code}): {error.message}")

    data = parse_json_response(response.text)

    if data.get("unknown_book"):
        return {"status": "unknown_book"}

    # Set here, not asked of the model: even if it returns a value
    # anyway, that value is overwritten and never saved.
    data["is_present_tense"] = None

    try:
        attributes = StyleAttributesIn(**data)
    except ValidationError as error:
        raise InvalidResponseError(f"Response did not match the expected shape: {error}", response.text)

    return {"status": "tagged", "attributes": attributes.model_dump()}
