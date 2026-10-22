// Main screen: search a book, pick it, see style-similar recommendations
// with a rationale and a bookstore link, and rate the picked book. Owns
// every bit of state and logic this screen needs; the components it
// renders only display what they're given and report changes back.
//
// Two views: the search results, or - once a book is picked - the book
// view, which replaces the results. Picking a book adds a browser history
// entry, so the browser's Back button returns to the results (History
// API, no router - see DECISIONS.md).

import { useEffect, useRef, useState } from "react";

import { API_URL, fetchAllPages } from "../api";
import BookResults from "./BookResults";
import BookView from "./BookView";
import HowItWorks from "./HowItWorks";
import SearchForm from "./SearchForm";

export default function MainScreen() {
  // Search box value (controlled input).
  const [searchTerm, setSearchTerm] = useState("");
  // Search results: null before the first search, [] if a search found
  // nothing, otherwise the list of matching books. Kept while a book is
  // open, so going back shows the same results with no new request.
  const [searchResults, setSearchResults] = useState(null);
  // Status of the search request itself, separate from its results.
  const [searchStatus, setSearchStatus] = useState("idle"); // idle | loading | error

  // Which book is open: null means the results view is showing. Set the
  // moment a book is clicked, before its details arrive, so the view
  // switches right away.
  const [selectedBookId, setSelectedBookId] = useState(null);
  // The open book's details (from GET /books/{id}), null until loaded.
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookStatus, setBookStatus] = useState("idle"); // idle | loading | error

  // Recommendations for the open book: null before they load, [] if
  // none, otherwise the list of recommendations.
  const [recommendations, setRecommendations] = useState(null);
  // Status of the recommendations request. "not_tagged" is its own
  // state (not just "error") because a 409 needs a different message.
  const [recommendationsStatus, setRecommendationsStatus] = useState("idle"); // idle | loading | error | not_tagged
  // Genre filter toggle, sent as the `genre` query parameter.
  const [genreFilter, setGenreFilter] = useState("any"); // any | same | different

  // Refs hold values that must survive re-renders but shouldn't cause
  // one when they change.
  // - currentBookIdRef: the book whose responses we still want. A slow
  //   response for a book the user already left is ignored.
  // - savedScrollRef: where the results list was scrolled to when a book
  //   was opened, restored on the way back.
  // - restoreScrollRef: true when returning to the results should
  //   restore that scroll position (not when leaving for a new search).
  // - leavingForSearchRef: set while a new search closes the book view.
  const currentBookIdRef = useRef(null);
  const savedScrollRef = useRef(0);
  const restoreScrollRef = useRef(false);
  const leavingForSearchRef = useRef(false);

  // Takes a search term. Fetches every matching book (all pages - see
  // fetchAllPages in api.js; an empty search matches the whole catalog)
  // and stores them in searchResults, or flags searchStatus as "error"
  // on failure. Also returns the books (or null on failure), so a caller
  // like handleTryExample can act on the results right away. Exists as
  // the one place that knows how to search books.
  async function searchBooks(term) {
    setSearchStatus("loading");
    try {
      const books = await fetchAllPages("/books", { search: term });
      setSearchResults(books);
      setSearchStatus("idle");
      return books;
    } catch {
      setSearchResults(null);
      setSearchStatus("error");
      return null;
    }
  }

  // Takes a book id and the current genre filter. Calls
  // GET /books/{id}/recommendations and stores the result in
  // recommendations. Reads the 409 "not tagged" response explicitly,
  // since it needs a different message than a generic failure. Exists
  // on its own (not inside showBook) so changing just the genre filter
  // can re-run it without re-fetching the book itself. Ignores the
  // response if the user has left this book in the meantime.
  async function loadRecommendations(bookId, genre) {
    setRecommendationsStatus("loading");
    try {
      const response = await fetch(
        `${API_URL}/books/${bookId}/recommendations?genre=${genre}`,
      );
      if (currentBookIdRef.current !== bookId) return;
      if (response.status === 409) {
        setRecommendations(null);
        setRecommendationsStatus("not_tagged");
        return;
      }
      if (!response.ok) throw new Error("recommendations request failed");
      const results = await response.json();
      if (currentBookIdRef.current !== bookId) return;
      setRecommendations(results);
      setRecommendationsStatus("idle");
    } catch {
      if (currentBookIdRef.current !== bookId) return;
      setRecommendations(null);
      setRecommendationsStatus("error");
    }
  }

  // Takes a book id. Switches to the book view at once (with a loading
  // message), then loads the book's details and its recommendations.
  // Doesn't touch browser history - used both when the user picks a book
  // (openBook adds the history entry) and when Forward returns to one
  // (the entry already exists).
  async function showBook(bookId) {
    currentBookIdRef.current = bookId;
    setSelectedBookId(bookId);
    setSelectedBook(null);
    setBookStatus("loading");
    setRecommendations(null);
    loadRecommendations(bookId, genreFilter);
    try {
      const response = await fetch(`${API_URL}/books/${bookId}`);
      if (!response.ok) throw new Error("book request failed");
      const book = await response.json();
      if (currentBookIdRef.current !== bookId) return;
      setSelectedBook(book);
      setBookStatus("idle");
    } catch {
      if (currentBookIdRef.current !== bookId) return;
      setBookStatus("error");
    }
  }

  // Takes a book id - from a search result or an example book. Remembers
  // the results' scroll position, adds a browser history entry for this
  // book (pushState: no reload, no URL change), shows the book, and
  // scrolls to the top of the page where the book view starts.
  function openBook(bookId) {
    savedScrollRef.current = window.scrollY;
    window.history.pushState({ bookId }, "");
    showBook(bookId);
    window.scrollTo(0, 0);
  }

  // Takes nothing. Returns to the results view. Called only from the
  // popstate handler below, so every way back - the browser's Back button
  // or the on-page button (which calls history.back()) - goes through
  // here. Restores the results' scroll position unless the book view was
  // closed by a new search.
  function closeBook() {
    currentBookIdRef.current = null;
    restoreScrollRef.current = !leavingForSearchRef.current;
    leavingForSearchRef.current = false;
    setSelectedBookId(null);
    setSelectedBook(null);
    setBookStatus("idle");
  }

  // Listens for the browser's Back / Forward buttons. A history entry
  // with a bookId means "this book was open" (Forward); one without means
  // "the results" (Back). The cleanup removes the listener when this
  // screen goes away or before it's re-added. Re-added when genreFilter
  // changes, because showBook reads it - otherwise the listener would
  // keep the genreFilter from the render it was created in.
  useEffect(() => {
    function handlePopState(event) {
      if (event.state && event.state.bookId) {
        showBook(event.state.bookId);
      } else {
        closeBook();
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [genreFilter]);

  // Takes over scroll restoration from the browser while this screen is
  // shown. The browser's own restore runs before React re-renders the
  // results list, so it can't land in the right place; savedScrollRef
  // does it instead (see the next effect). Handed back on the way out.
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = "auto";
    };
  }, []);

  // After the results view is back on screen (selectedBookId just became
  // null), scrolls to where the list was. Runs after React has rendered
  // the list, which is why it's an effect and not part of closeBook.
  useEffect(() => {
    if (selectedBookId === null && restoreScrollRef.current) {
      window.scrollTo(0, savedScrollRef.current);
      restoreScrollRef.current = false;
    }
  }, [selectedBookId]);

  // Takes the submit event from the search form. Prevents the default
  // page reload and runs the search with the current searchTerm. If a
  // book is open, steps back out of its history entry first, so Back
  // afterwards doesn't land on a book view that's no longer showing.
  function handleSearchSubmit(event) {
    event.preventDefault();
    if (selectedBookId !== null) {
      leavingForSearchRef.current = true;
      window.history.back();
    }
    searchBooks(searchTerm);
  }

  // Takes an example title from HowItWorks. Searches for it exactly as
  // if the user had typed it, then opens the book whose title matches
  // exactly - one click straight to its recommendations. Finds the book
  // by title through the normal search, not by a hardcoded id, so it
  // works on any database. If no exact match comes back, the user just
  // sees the search results, as after any search.
  async function handleTryExample(title) {
    setSearchTerm(title);
    const books = await searchBooks(title);
    const match = books && books.find((book) => book.title === title);
    if (match) {
      openBook(match.id);
    }
  }

  // Takes the rating just saved by RatingForm. Stores it on
  // selectedBook, so the "your rating" line updates right away without
  // re-fetching the book.
  function handleRatingSaved(savedRating) {
    setSelectedBook((previous) => ({ ...previous, rating: savedRating }));
  }

  // Takes the new genre filter value. Updates it and re-loads
  // recommendations for the open book - the book itself does not need to
  // be re-fetched.
  function handleGenreChange(genre) {
    setGenreFilter(genre);
    if (selectedBookId !== null) {
      loadRecommendations(selectedBookId, genre);
    }
  }

  return (
    <>
      <SearchForm
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSubmit={handleSearchSubmit}
      />
      {selectedBookId === null ? (
        <>
          {/* Only before anything has happened: no search yet (or one in
              flight). Disappears as soon as there's something real to show. */}
          {searchResults === null && searchStatus === "idle" && (
            <HowItWorks onTryExample={handleTryExample} />
          )}
          <BookResults status={searchStatus} results={searchResults} onSelectBook={openBook} />
        </>
      ) : (
        <BookView
          bookStatus={bookStatus}
          book={selectedBook}
          recommendations={recommendations}
          recommendationsStatus={recommendationsStatus}
          genreFilter={genreFilter}
          onGenreChange={handleGenreChange}
          onRatingSaved={handleRatingSaved}
          // Same path as the browser's Back button: popstate -> closeBook.
          onBack={() => window.history.back()}
        />
      )}
    </>
  );
}
