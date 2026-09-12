-- Demo data: real, well-known books with hand-picked style attributes,
-- chosen to cover a spread of values on every attribute so similarity
-- results are easy to sanity-check (e.g. Hemingway/McCarthy should come
-- out close; Tolkien/Garcia Marquez should come out close despite
-- different genres).
--
-- open_library_id is a placeholder slug, not a real Open Library id: this
-- data is hand-seeded ahead of the real Open Library integration (see
-- CLAUDE.md, "Data source (later)"). cover_url is left NULL for the same
-- reason. Runs after schema.sql (filename order), only on first startup.

INSERT INTO books (open_library_id, title, author, genre) VALUES
    ('seed-old-man-and-the-sea', 'The Old Man and the Sea', 'Ernest Hemingway', 'Literary Fiction'),
    ('seed-the-road', 'The Road', 'Cormac McCarthy', 'Post-Apocalyptic Fiction'),
    ('seed-1984', '1984', 'George Orwell', 'Dystopian Fiction'),
    ('seed-hitchhikers-guide', 'The Hitchhiker''s Guide to the Galaxy', 'Douglas Adams', 'Science Fiction Comedy'),
    ('seed-good-omens', 'Good Omens', 'Terry Pratchett and Neil Gaiman', 'Fantasy Comedy'),
    ('seed-fellowship-of-the-ring', 'The Fellowship of the Ring', 'J.R.R. Tolkien', 'Epic Fantasy'),
    ('seed-100-years-of-solitude', 'One Hundred Years of Solitude', 'Gabriel Garcia Marquez', 'Magical Realism'),
    ('seed-slaughterhouse-five', 'Slaughterhouse-Five', 'Kurt Vonnegut', 'Science Fiction'),
    ('seed-the-big-sleep', 'The Big Sleep', 'Raymond Chandler', 'Mystery'),
    ('seed-pride-and-prejudice', 'Pride and Prejudice', 'Jane Austen', 'Romance'),
    ('seed-the-hunger-games', 'The Hunger Games', 'Suzanne Collins', 'Young Adult Dystopian'),
    ('seed-fault-in-our-stars', 'The Fault in Our Stars', 'John Green', 'Young Adult'),
    ('seed-dracula', 'Dracula', 'Bram Stoker', 'Gothic Horror'),
    ('seed-da-vinci-code', 'The Da Vinci Code', 'Dan Brown', 'Thriller'),
    -- Deliberately has no matching row below in book_style_attributes:
    -- a real, plausible "not tagged yet" book for testing that path
    -- (untagged in search results, 409 from /recommendations).
    ('seed-brave-new-world', 'Brave New World', 'Aldous Huxley', 'Dystopian Fiction');

-- One row per book above, matched by open_library_id so this does not
-- depend on the auto-generated id order.
INSERT INTO book_style_attributes
    (book_id, sentence_length, description_density, dialogue_ratio, pov,
     is_present_tense, tone, pacing, vocabulary_complexity, is_nonlinear, has_humor)
SELECT id, v.sentence_length, v.description_density, v.dialogue_ratio, v.pov,
       v.is_present_tense, v.tone, v.pacing, v.vocabulary_complexity, v.is_nonlinear, v.has_humor
FROM books
JOIN (VALUES
    -- open_library_id,                sentence_length, desc_density, dialogue_ratio, pov,               present, tone, pacing, vocab, nonlinear, humor
    ('seed-old-man-and-the-sea',       'short',  2, 'low',    'third_limited',    false, 3, 2, 2, false, false),
    ('seed-the-road',                  'short',  3, 'low',    'third_limited',    false, 5, 2, 2, false, false),
    ('seed-1984',                      'medium', 3, 'medium', 'third_limited',    false, 5, 3, 3, false, false),
    ('seed-hitchhikers-guide',         'medium', 2, 'high',   'third_omniscient', false, 1, 4, 3, false, true),
    ('seed-good-omens',                'medium', 3, 'high',   'third_omniscient', false, 2, 4, 3, false, true),
    ('seed-fellowship-of-the-ring',    'long',   5, 'low',    'third_omniscient', false, 3, 1, 5, false, false),
    ('seed-100-years-of-solitude',     'long',   5, 'low',    'third_omniscient', false, 3, 1, 5, true,  false),
    ('seed-slaughterhouse-five',       'short',  2, 'medium', 'first',            false, 4, 3, 2, true,  true),
    ('seed-the-big-sleep',             'medium', 3, 'high',   'first',            false, 4, 4, 3, false, true),
    ('seed-pride-and-prejudice',       'long',   3, 'high',   'third_omniscient', false, 1, 2, 4, false, true),
    ('seed-the-hunger-games',          'short',  2, 'medium', 'first',            true,  4, 5, 2, false, false),
    ('seed-fault-in-our-stars',        'medium', 2, 'high',   'first',            false, 4, 3, 2, false, true),
    ('seed-dracula',                   'long',   4, 'medium', 'first',            false, 5, 2, 4, false, false),
    ('seed-da-vinci-code',             'short',  2, 'medium', 'third_limited',    false, 3, 5, 2, false, false)
) AS v (open_library_id, sentence_length, description_density, dialogue_ratio, pov,
        is_present_tense, tone, pacing, vocabulary_complexity, is_nonlinear, has_humor)
    ON books.open_library_id = v.open_library_id;
