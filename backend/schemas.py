"""
Pydantic request/response shapes shared across the API (main.py) and the
standalone LLM scripts (llm_tagging.py and the two CLI scripts that use
it). Pulled out of main.py so the scripts can validate an LLM response
against the exact same rules the API enforces, without importing
main.py itself (which would also load the whole FastAPI app).
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


# Request body for POST /books. Field constraints reject an empty title
# or author before the request reaches the database. language is
# required here even though the database column is nullable (see
# DECISIONS.md) - existing seed books predate the column, but every new
# book added through this form must declare one.
class BookIn(BaseModel):
    title: str = Field(min_length=1)
    author: str = Field(min_length=1)
    # The work's original title, if `title` is a translation (e.g. a
    # Hebrew edition of an English book). Optional - only relevant for
    # translated books; helps LLM auto-tagging recognize a well-known
    # book it wouldn't otherwise connect to its translated title.
    title_original: str | None = None
    genre: str | None = None
    language: Literal["he", "en"]


# The 10 style attributes, and nothing else. The shape an LLM-tagged
# response is validated against before it's trusted, and the base of
# StyleAttributesPut below. The Literal and Field(ge=..., le=...)
# constraints mirror the CHECK constraints in db/schema.sql exactly, so
# an invalid value is rejected with a clear error before it ever
# reaches the database.
class StyleAttributesIn(BaseModel):
    sentence_length: Literal["short", "medium", "long"]
    description_density: int = Field(ge=1, le=5)
    dialogue_ratio: Literal["low", "medium", "high"]
    pov: Literal["first", "third_limited", "third_omniscient", "second"]
    # None means "unknown" (NULL in the database). Still required as a
    # key - a caller must send it, even if the value is null - so a
    # forgotten field is an error, not a silent unknown. Tagged manually
    # only (see DECISIONS.md).
    is_present_tense: bool | None
    tone: int = Field(ge=1, le=5)
    pacing: int = Field(ge=1, le=5)
    vocabulary_complexity: int = Field(ge=1, le=5)
    is_nonlinear: bool
    has_humor: bool


# Request body for PUT /books/{id}/style-attributes: the 10 style
# attributes plus who is tagging. tagged_by lives here and not in
# StyleAttributesIn because it's request metadata, not a style
# attribute - the LLM response never has it (see DECISIONS.md).
class StyleAttributesPut(StyleAttributesIn):
    tagged_by: Literal["manual", "llm"]


# Request body for PUT /books/{id}/rating. rating mirrors the CHECK
# constraint in db/schema.sql (1-5). note is optional - leaving it out
# simply means no note.
class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    note: str | None = None

    # Takes the incoming note. Returns None if it's missing, empty, or
    # only whitespace, otherwise the note exactly as written. Exists so
    # "no note" is always stored as NULL, never also as "" or "   " -
    # one form for one meaning (see DECISIONS.md).
    @field_validator("note")
    @classmethod
    def blank_note_to_none(cls, note):
        if note is None or not note.strip():
            return None
        return note
