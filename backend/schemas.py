"""
Pydantic request/response shapes shared across the API (main.py) and the
standalone LLM scripts (llm_tagging.py and the two CLI scripts that use
it). Pulled out of main.py so the scripts can validate an LLM response
against the exact same rules the API enforces, without importing
main.py itself (which would also load the whole FastAPI app).
"""

from typing import Literal

from pydantic import BaseModel, Field


# Request body for POST /books. Field constraints reject an empty title
# or author before the request reaches the database. language is
# required here even though the database column is nullable (see
# DECISIONS.md) - existing seed books predate the column, but every new
# book added through this form must declare one.
class BookIn(BaseModel):
    title: str = Field(min_length=1)
    author: str = Field(min_length=1)
    genre: str | None = None
    language: Literal["he", "en"]


# Request body for PUT /books/{id}/style-attributes, and the shape an
# LLM-tagged response is validated against before it's trusted. The
# Literal and Field(ge=..., le=...) constraints mirror the CHECK
# constraints in db/schema.sql exactly, so an invalid value is rejected
# with a clear error before it ever reaches the database.
class StyleAttributesIn(BaseModel):
    sentence_length: Literal["short", "medium", "long"]
    description_density: int = Field(ge=1, le=5)
    dialogue_ratio: Literal["low", "medium", "high"]
    pov: Literal["first", "third_limited", "third_omniscient", "second"]
    is_present_tense: bool
    tone: int = Field(ge=1, le=5)
    pacing: int = Field(ge=1, le=5)
    vocabulary_complexity: int = Field(ge=1, le=5)
    is_nonlinear: bool
    has_humor: bool
