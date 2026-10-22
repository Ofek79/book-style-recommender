// Full app: switches between the main screen (search a book, pick it,
// see style-similar recommendations) and the tagging screen (add books,
// tag their style attributes). The switch is a plain view state, not a
// router - see DECISIONS.md. No state library either, just useState and
// plain fetch calls, same as day 1.
//
// UI text is Hebrew (the page is lang="he" dir="rtl" - see index.html);
// names, comments, and API calls stay English.

import { useState } from "react";

import TaggingScreen from "./TaggingScreen";

// Base URL of the API, injected by Vite from VITE_API_URL (see .env).
const API_URL = import.meta.env.VITE_API_URL;

// How many books to ask for per GET /books call - the API's own maximum
// for limit. A broad search can match more than one page, so results
// are loaded page by page (see searchBooks).
const PAGE_SIZE = 100;

// The rating scale shown as radio buttons in RatingForm - same 1-5 as
// the CHECK constraint in db/schema.sql.
const RATING_VALUES = [1, 2, 3, 4, 5];

// Takes a rating from 1 to 5. Returns it as plain-text stars, e.g. 2 ->
// "★★☆☆☆". Exists so the book detail and every recommendation show a
// rating the same way, without a star-rating library.
function formatStars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default function App() {
  // Which screen is showing. Toggled by the two nav buttons below -
  // no router, no URL change (see DECISIONS.md).
  const [view, setView] = useState("main"); // main | tagging

  return (
    <main>
      <h1>מומלצי סגנון</h1>
      <nav>
        <button type="button" onClick={() => setView("main")}>
          חיפוש והמלצות
        </button>
        <button type="button" onClick={() => setView("tagging")}>
          תיוג ספרים
        </button>
      </nav>
      {view === "main" ? <MainScreen /> : <TaggingScreen />}
    </main>
  );
}

// The original app: search a book, pick it, see style-similar
// recommendations with a rationale and a bookstore link. Pulled out of
// App itself so App only has to know about switching screens - this
// component owns every bit of state and logic the main screen needs.
function MainScreen() {
  // Search box value (controlled input).
  const [searchTerm, setSearchTerm] = useState("");
  // Search results: null before the first search, [] if a search found
  // nothing, otherwise the list of matching books.
  const [searchResults, setSearchResults] = useState(null);
  // Status of the search request itself, separate from its results.
  const [searchStatus, setSearchStatus] = useState("idle"); // idle | loading | error

  // The book the user picked from search results, including its
  // style_attributes (from GET /books/{id}).
  const [selectedBook, setSelectedBook] = useState(null);

  // Recommendations for selectedBook: null before any book is picked,
  // [] if a search found none, otherwise the list of recommendations.
  const [recommendations, setRecommendations] = useState(null);
  // Status of the recommendations request. "not_tagged" is its own
  // state (not just "error") because a 409 needs a different message.
  const [recommendationsStatus, setRecommendationsStatus] = useState("idle"); // idle | loading | error | not_tagged
  // Genre filter toggle, sent as the `genre` query parameter.
  const [genreFilter, setGenreFilter] = useState("any"); // any | same | different

  // Takes a search term. Calls GET /books?search= page by page (offset
  // by PAGE_SIZE until a page comes back short - one call is capped at
  // 100 books, and an empty search matches the whole catalog) and
  // stores every match in searchResults, or flags searchStatus as
  // "error" on failure. Exists as the one place that knows how to
  // search books.
  async function searchBooks(term) {
    setSearchStatus("loading");
    try {
      const books = [];
      let offset = 0;
      while (true) {
        const response = await fetch(
          `${API_URL}/books?search=${encodeURIComponent(term)}&limit=${PAGE_SIZE}&offset=${offset}`,
        );
        if (!response.ok) throw new Error("search request failed");
        const page = await response.json();
        books.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setSearchResults(books);
      setSearchStatus("idle");
    } catch {
      setSearchResults(null);
      setSearchStatus("error");
    }
  }

  // Takes a book id and the current genre filter. Calls
  // GET /books/{id}/recommendations and stores the result in
  // recommendations. Reads the 409 "not tagged" response explicitly,
  // since it needs a different message than a generic failure. Exists
  // on its own (not inside selectBook) so changing just the genre
  // filter can re-run it without re-fetching the book itself.
  async function loadRecommendations(bookId, genre) {
    setRecommendationsStatus("loading");
    try {
      const response = await fetch(
        `${API_URL}/books/${bookId}/recommendations?genre=${genre}`,
      );
      if (response.status === 409) {
        setRecommendations(null);
        setRecommendationsStatus("not_tagged");
        return;
      }
      if (!response.ok) throw new Error("recommendations request failed");
      const results = await response.json();
      setRecommendations(results);
      setRecommendationsStatus("idle");
    } catch {
      setRecommendations(null);
      setRecommendationsStatus("error");
    }
  }

  // Takes a book id from a search result. Calls GET /books/{id} to get
  // its full detail (including style_attributes), then loads its
  // recommendations under the current genre filter. Exists as the one
  // place that knows what "picking a book" means end to end.
  async function selectBook(bookId) {
    setSelectedBook(null);
    setRecommendations(null);
    try {
      const response = await fetch(`${API_URL}/books/${bookId}`);
      if (!response.ok) throw new Error("book request failed");
      const book = await response.json();
      setSelectedBook(book);
    } catch {
      setSelectedBook(null);
    }
    loadRecommendations(bookId, genreFilter);
  }

  // Takes the submit event from the search form. Prevents the default
  // page reload and runs the search with the current searchTerm.
  function handleSearchSubmit(event) {
    event.preventDefault();
    searchBooks(searchTerm);
  }

  // Takes the rating just saved by RatingForm. Stores it on
  // selectedBook, so the "your rating" line updates right away without
  // re-fetching the book.
  function handleRatingSaved(savedRating) {
    setSelectedBook((previous) => ({ ...previous, rating: savedRating }));
  }

  // Takes the new genre filter value. Updates it and re-loads
  // recommendations for the already-selected book - the book itself
  // does not need to be re-fetched.
  function handleGenreChange(genre) {
    setGenreFilter(genre);
    if (selectedBook) {
      loadRecommendations(selectedBook.id, genre);
    }
  }

  return (
    <>
      <SearchForm
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSubmit={handleSearchSubmit}
      />
      <BookResults
        status={searchStatus}
        results={searchResults}
        onSelectBook={selectBook}
      />
      {selectedBook && (
        <section>
          <h2>
            המלצות סגנון עבור: {selectedBook.title} — {selectedBook.author}
          </h2>
          {selectedBook.rating && (
            <p>
              הדירוג שלך: {formatStars(selectedBook.rating.rating)}
              {selectedBook.rating.note && ` — ${selectedBook.rating.note}`}
            </p>
          )}
          {/* key: a different book remounts the form, so its fields
              start from that book's rating instead of the previous one's. */}
          <RatingForm
            key={selectedBook.id}
            bookId={selectedBook.id}
            currentRating={selectedBook.rating}
            onSaved={handleRatingSaved}
          />
          <GenreFilter value={genreFilter} onChange={handleGenreChange} />
          <RecommendationList
            status={recommendationsStatus}
            recommendations={recommendations}
          />
        </section>
      )}
    </>
  );
}

// Takes the current search term, a setter for it, and a submit handler.
// Renders the search box as a controlled input. Holds no state of its
// own - App owns searchTerm, this just displays it and reports changes.
function SearchForm({ searchTerm, onSearchTermChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <input
        type="text"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="חיפוש ספר לפי שם או מחבר..."
      />
      <button type="submit">חיפוש</button>
    </form>
  );
}

// Takes the search request's status, its results (null | []  | books),
// and a callback for picking a book. Renders the right message for
// loading/error/no-search-yet/no-results, or the list of matches.
// is_tagged is shown on each result so the user understands up front
// why an untagged book won't have recommendations.
function BookResults({ status, results, onSelectBook }) {
  if (status === "loading") {
    return <p>מחפש...</p>;
  }
  if (status === "error") {
    return <p>שגיאה בחיפוש. ודאו שהשרת רץ.</p>;
  }
  if (results === null) {
    return null; // no search submitted yet
  }
  if (results.length === 0) {
    return <p>לא נמצאו ספרים שמתחילים כך.</p>;
  }
  return (
    <ul>
      {results.map((book) => (
        <li key={book.id}>
          <button type="button" onClick={() => onSelectBook(book.id)}>
            {book.title} — {book.author}
            {!book.is_tagged && " (לא מתויג)"}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Takes a book id, the book's current rating (null | {rating, note}),
// and a callback for after a successful save. Renders 1-5 radio buttons
// and a note box, pre-filled from currentRating, and saves them with
// PUT /books/{id}/rating. Holds its own form state - it's only the
// draft until saved; MainScreen owns the saved rating. Works for any
// book, tagged or not (see DECISIONS.md).
function RatingForm({ bookId, currentRating, onSaved }) {
  const [rating, setRating] = useState(currentRating ? currentRating.rating : null);
  const [note, setNote] = useState(currentRating && currentRating.note ? currentRating.note : "");
  const [status, setStatus] = useState("idle"); // idle | loading | error | saved

  // Takes the submit event. Sends rating and note (a blank note is
  // stored as null by the server), then hands the saved row back to
  // MainScreen through onSaved.
  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    try {
      const response = await fetch(`${API_URL}/books/${bookId}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, note }),
      });
      if (!response.ok) throw new Error("save rating request failed");
      const saved = await response.json();
      setNote(saved.note ?? "");
      setStatus("saved");
      onSaved(saved);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset>
        <legend>{currentRating ? "עדכון הדירוג שלך" : "דרגו את הספר"}</legend>
        {RATING_VALUES.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              checked={rating === value}
              onChange={() => setRating(value)}
            />
            {formatStars(value)}
          </label>
        ))}
        <label>
          הערה (אופציונלי)
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {/* Disabled until a star count is picked - the server requires one. */}
        <button type="submit" disabled={rating === null || status === "loading"}>
          שמירת דירוג
        </button>
      </fieldset>
      {status === "loading" && <p>שומר...</p>}
      {status === "error" && <p>שגיאה בשמירת הדירוג.</p>}
      {status === "saved" && <p>הדירוג נשמר.</p>}
    </form>
  );
}

// Takes the current genre filter value and a change callback. Renders
// the any/same/different toggle as a radio group. Holds no state of
// its own - App owns genreFilter.
function GenreFilter({ value, onChange }) {
  return (
    <fieldset>
      <legend>סינון לפי ז'אנר</legend>
      <label>
        <input
          type="radio"
          name="genre"
          value="any"
          checked={value === "any"}
          onChange={() => onChange("any")}
        />
        הכל
      </label>
      <label>
        <input
          type="radio"
          name="genre"
          value="same"
          checked={value === "same"}
          onChange={() => onChange("same")}
        />
        אותו ז'אנר
      </label>
      <label>
        <input
          type="radio"
          name="genre"
          value="different"
          checked={value === "different"}
          onChange={() => onChange("different")}
        />
        ז'אנר אחר
      </label>
    </fieldset>
  );
}

// Takes the recommendations request's status and its results (null | []
// | recommendations). Renders the right message for loading/error/
// not-tagged/no-book-selected-yet/no-results, or the list itself - each
// item with its similarity score, its rationale sentences, a bookstore
// search link, and the reader's rating and note if the book is rated.
// A low-rated book is shown like any other, in the order the server
// sent - the rating is information, not a filter (see DECISIONS.md).
function RecommendationList({ status, recommendations }) {
  if (status === "loading") {
    return <p>טוען המלצות...</p>;
  }
  if (status === "not_tagged") {
    return <p>הספר הזה עדיין לא תויג, ולכן אין לו המלצות.</p>;
  }
  if (status === "error") {
    return <p>שגיאה בטעינת ההמלצות.</p>;
  }
  if (recommendations === null) {
    return null; // no book selected yet
  }
  if (recommendations.length === 0) {
    return <p>לא נמצאו המלצות בסינון הזה. נסו "הכל".</p>;
  }
  return (
    <ul>
      {recommendations.map((recommendation) => (
        <li key={recommendation.book.id}>
          <h3>
            {recommendation.book.title} — {recommendation.book.author}
          </h3>
          <p>ציון דמיון: {recommendation.similarity_score}</p>
          {recommendation.book.rating && (
            <p>
              הדירוג שלך: {formatStars(recommendation.book.rating.rating)}
              {recommendation.book.rating.note && ` — ${recommendation.book.rating.note}`}
            </p>
          )}
          <ul>
            {recommendation.rationale.map((sentence, index) => (
              <li key={index}>{sentence}</li>
            ))}
          </ul>
          <a
            href={recommendation.bookstore_search_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            חיפוש בחנות ספרים
          </a>
        </li>
      ))}
    </ul>
  );
}
