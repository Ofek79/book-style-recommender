// Main screen: search a book, pick it, see style-similar recommendations
// with a rationale and a bookstore link, and rate the picked book. Owns
// every bit of state and logic this screen needs; the components it
// renders only display what they're given and report changes back.

import { useState } from "react";

import { API_URL, fetchAllPages } from "../api";
import BookResults from "./BookResults";
import GenreFilter from "./GenreFilter";
import RatingForm from "./RatingForm";
import RecommendationList from "./RecommendationList";
import SearchForm from "./SearchForm";
import Stars from "./Stars";

export default function MainScreen() {
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

  // Takes a search term. Fetches every matching book (all pages - see
  // fetchAllPages in api.js; an empty search matches the whole catalog)
  // and stores them in searchResults, or flags searchStatus as "error"
  // on failure. Exists as the one place that knows how to search books.
  async function searchBooks(term) {
    setSearchStatus("loading");
    try {
      const books = await fetchAllPages("/books", { search: term });
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
              הדירוג שלך: <Stars rating={selectedBook.rating.rating} />
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
