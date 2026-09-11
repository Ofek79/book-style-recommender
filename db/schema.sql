-- Schema for the book style recommender.
-- Run automatically by Postgres on first container startup (mounted into
-- /docker-entrypoint-initdb.d/ in docker-compose.yml).

-- Book metadata, sourced from the Open Library API. Not manually edited.
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    open_library_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    genre TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Search is the app's main action, so these are defined upfront.
CREATE INDEX idx_books_title ON books (title);
CREATE INDEX idx_books_author ON books (author);

-- Manually-tagged writing-style attributes, one row per tagged book.
-- book_id is both the primary key and the foreign key: this table is a
-- strict 1:1 extension of books. A book with no row here is "not tagged
-- yet" and is excluded from recommendations by a plain INNER JOIN -
-- no separate status flag needed.
CREATE TABLE book_style_attributes (
    book_id INTEGER PRIMARY KEY REFERENCES books (id) ON DELETE CASCADE,
    sentence_length TEXT NOT NULL
        CHECK (sentence_length IN ('short', 'medium', 'long')),
    description_density SMALLINT NOT NULL
        CHECK (description_density BETWEEN 1 AND 5),
    dialogue_ratio TEXT NOT NULL
        CHECK (dialogue_ratio IN ('low', 'medium', 'high')),
    pov TEXT NOT NULL
        CHECK (pov IN ('first', 'third_limited', 'third_omniscient', 'second')),
    is_present_tense BOOLEAN NOT NULL,
    tone SMALLINT NOT NULL
        CHECK (tone BETWEEN 1 AND 5),
    pacing SMALLINT NOT NULL
        CHECK (pacing BETWEEN 1 AND 5),
    vocabulary_complexity SMALLINT NOT NULL
        CHECK (vocabulary_complexity BETWEEN 1 AND 5),
    is_nonlinear BOOLEAN NOT NULL,
    has_humor BOOLEAN NOT NULL,
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
