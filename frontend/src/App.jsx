// Full app: search a book, pick it, see style-similar recommendations
// with a rationale and a bookstore link. No routing, no state library -
// just useState and plain fetch calls, same as day 1.
//
// UI text is Hebrew (the page is lang="he" dir="rtl" - see index.html);
// names, comments, and API calls stay English.

import { useState } from "react";

// Base URL of the API, injected by Vite from VITE_API_URL (see .env).
const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
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

  // Takes a search term. Calls GET /books?search= and stores the
  // result in searchResults, or flags searchStatus as "error" on
  // failure. Exists as the one place that knows how to search books.
  async function searchBooks(term) {
    setSearchStatus("loading");
    try {
      const response = await fetch(`${API_URL}/books?search=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error("search request failed");
      const books = await response.json();
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
    <main>
      <h1>מומלצי סגנון</h1>
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
          <GenreFilter value={genreFilter} onChange={handleGenreChange} />
          <RecommendationList
            status={recommendationsStatus}
            recommendations={recommendations}
          />
        </section>
      )}
    </main>
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
// item with its similarity score, its rationale sentences, and a
// bookstore search link.
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
