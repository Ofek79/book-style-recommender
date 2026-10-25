// Main screen: search a book, pick it, see style-similar recommendations
// with a rationale and a bookstore link, and rate the picked book. Owns
// every bit of state and logic this screen needs; the components it
// renders only display what they're given and report changes back.
//
// Two views: the search results (before any search: the home screen with
// "how it works"), or - once a book is picked - the book view, which
// replaces the results. Picking a book adds a browser history entry, so
// the browser's Back button returns to the results (History API, no
// router - see DECISIONS.md). The first history entry is always this
// screen's base view; Back from there leaves the site.

import { useEffect, useRef, useState } from "react";

import { API_URL, fetchAllPages } from "../api";
import BookResults from "./BookResults";
import BookView from "./BookView";
import HowItWorks from "./HowItWorks";
import SearchForm from "./SearchForm";

// Takes homeRequest: a counter from App that goes up each time the site
// title is clicked. Each new value means "go back to the home screen"
// (see goHome). A counter rather than true/false, so every click counts
// as a new request, even several in a row.
export default function MainScreen({ homeRequest }) {
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
  //   restore that scroll position.
  // - skipScrollRestoreRef: set while a new search or "go home" closes
  //   the book view - both jump back to the base entry, but to new
  //   content, so the old scroll position doesn't apply.
  // - latestRecommendationsRequestRef: counts recommendation requests, so
  //   only the newest one's response is shown - clicking the genre filter
  //   quickly can't let an older, slower response land last.
  // - latestSearchRequestRef: the same for searches, so a search still in
  //   flight can't fill the home screen after "go home" cleared it.
  const currentBookIdRef = useRef(null);
  const latestRecommendationsRequestRef = useRef(0);
  const latestSearchRequestRef = useRef(0);
  const savedScrollRef = useRef(0);
  const restoreScrollRef = useRef(false);
  const skipScrollRestoreRef = useRef(false);

  // Takes a search term. Fetches every matching book (all pages - see
  // fetchAllPages in api.js; an empty search matches the whole catalog)
  // and stores them in searchResults, or flags searchStatus as "error"
  // on failure. Ignores the response if a newer search - or "go home" -
  // happened since. Exists as the one place that knows how to search
  // books.
  async function searchBooks(term) {
    latestSearchRequestRef.current += 1;
    const requestNumber = latestSearchRequestRef.current;
    setSearchStatus("loading");
    try {
      const books = await fetchAllPages("/books", { search: term });
      if (requestNumber !== latestSearchRequestRef.current) return;
      setSearchResults(books);
      setSearchStatus("idle");
    } catch {
      if (requestNumber !== latestSearchRequestRef.current) return;
      setSearchResults(null);
      setSearchStatus("error");
    }
  }

  // Takes a book id and the current genre filter. Calls
  // GET /books/{id}/recommendations and stores the result in
  // recommendations. Reads the 409 "not tagged" response explicitly,
  // since it needs a different message than a generic failure. Exists
  // on its own (not inside showBook) so changing just the genre filter
  // can re-run it without re-fetching the book itself. Ignores the
  // response if a newer request was made since (another filter click, or
  // a different book).
  async function loadRecommendations(bookId, genre) {
    latestRecommendationsRequestRef.current += 1;
    const requestNumber = latestRecommendationsRequestRef.current;
    const isStale = () => requestNumber !== latestRecommendationsRequestRef.current;

    setRecommendationsStatus("loading");
    try {
      const response = await fetch(
        `${API_URL}/books/${bookId}/recommendations?genre=${genre}`,
      );
      if (isStale()) return;
      if (response.status === 409) {
        setRecommendations(null);
        setRecommendationsStatus("not_tagged");
        return;
      }
      if (!response.ok) throw new Error("recommendations request failed");
      const results = await response.json();
      if (isStale()) return;
      setRecommendations(results);
      setRecommendationsStatus("idle");
    } catch {
      if (isStale()) return;
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

  // Takes a book id - from a search result, an example book, or a
  // recommendation inside another book's view. Adds a browser history
  // entry for this book (pushState: no reload, no URL change), shows the
  // book, and scrolls to the top of the page where the book view starts.
  // Every opened book gets its own entry, so Back steps through them one
  // at a time: book B -> book A -> results.
  //
  // The results' scroll position is saved only when opening from the
  // results. Opening a book from another book would otherwise overwrite
  // it with the book view's scroll, and the final step back to the
  // results would land in the wrong place.
  //
  // Each entry also records its depth - how many books deep it is (1 for
  // a book opened from the results, 2 for one opened from that book, and
  // so on) - so a new search can jump straight back to the results entry
  // (see handleSearchSubmit). The results entry itself has no state, so
  // depth 0.
  function openBook(bookId) {
    if (selectedBookId === null) {
      savedScrollRef.current = window.scrollY;
    }
    const currentDepth = (window.history.state && window.history.state.depth) || 0;
    window.history.pushState({ bookId, depth: currentDepth + 1 }, "");
    showBook(bookId);
    window.scrollTo(0, 0);
  }

  // Takes nothing. Returns to the results view. Called only from the
  // popstate handler below, so every way back - the browser's Back button
  // or the on-page button (which calls history.back()) - goes through
  // here. Restores the results' scroll position unless the book view was
  // closed by a new search or by "go home".
  function closeBook() {
    currentBookIdRef.current = null;
    // Makes any recommendations request still in flight stale.
    latestRecommendationsRequestRef.current += 1;
    restoreScrollRef.current = !skipScrollRestoreRef.current;
    skipScrollRestoreRef.current = false;
    setSelectedBookId(null);
    setSelectedBook(null);
    setBookStatus("idle");
  }

  // Listens for the browser's Back / Forward buttons. A history entry
  // with a bookId means "this book was open" - the previous book on Back,
  // or the next one on Forward - and opens at the top of the page, not at
  // the scroll position of the page just left. One without a bookId means
  // "the results". The cleanup removes the listener when this
  // screen goes away or before it's re-added. Re-added when genreFilter
  // changes, because showBook reads it - otherwise the listener would
  // keep the genreFilter from the render it was created in.
  useEffect(() => {
    function handlePopState(event) {
      if (event.state && event.state.bookId) {
        showBook(event.state.bookId);
        window.scrollTo(0, 0);
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
  //
  // Also, on start: this screen always opens on the results view, so the
  // current history entry must mean "the results". If it still holds a
  // book - left over from before a page reload, or from switching to the
  // tagging tab while a book was open - Back would later land on it and
  // open that stale book instead of the results, and openBook would build
  // on its old depth. replaceState resets the entry in place (no new
  // entry, no navigation).
  useEffect(() => {
    if (window.history.state && window.history.state.bookId) {
      window.history.replaceState(null, "");
    }
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
  // book is open, first jumps back past every book entry to the results
  // entry - history.go(-depth), not history.back(), since after browsing
  // book to book the previous entry may be another book. That way Back
  // afterwards doesn't land on a book view that's no longer showing.
  function handleSearchSubmit(event) {
    event.preventDefault();
    if (selectedBookId !== null) {
      skipScrollRestoreRef.current = true;
      window.history.go(-window.history.state.depth);
    }
    searchBooks(searchTerm);
  }

  // Takes an example title from HowItWorks. Opens that book directly -
  // one click straight to its recommendations. Looks up its id with the
  // same search the search box uses (by title, exact match - not a
  // hardcoded id, so it works on any database), but does NOT store the
  // results or fill the search box: the home screen's state stays as it
  // was, so Back from the book returns to the clean home screen, not to
  // a search the user never made (see DECISIONS.md). If the lookup fails
  // or finds no exact match, falls back to a visible search for the
  // title, so the click still shows something.
  async function handleTryExample(title) {
    let match = null;
    try {
      const books = await fetchAllPages("/books", { search: title });
      match = books.find((book) => book.title === title) || null;
    } catch {
      match = null;
    }
    if (match) {
      openBook(match.id);
    } else {
      setSearchTerm(title);
      searchBooks(title);
    }
  }

  // Takes nothing. Returns to the home screen: jumps back to the base
  // history entry if a book is open (history.go(-depth), the same way a
  // new search does - the books stay reachable with Forward), clears the
  // search box and results so "how it works" and the example books show
  // again, and scrolls to the top. Called when the site title is clicked.
  function goHome() {
    if (selectedBookId !== null) {
      skipScrollRestoreRef.current = true;
      window.history.go(-window.history.state.depth);
    }
    // Makes any search still in flight stale, so it can't refill the list.
    latestSearchRequestRef.current += 1;
    setSearchTerm("");
    setSearchResults(null);
    setSearchStatus("idle");
    window.scrollTo(0, 0);
  }

  // Runs goHome each time App sends a new home request (the title was
  // clicked). Skipped for the initial 0 - no click yet. When the title is
  // clicked from the tagging tab, this screen mounts already on the home
  // screen, and goHome just finds nothing to undo.
  useEffect(() => {
    if (homeRequest > 0) {
      goHome();
    }
  }, [homeRequest]);

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

  // Names the view on screen below the search box: one key per book, and
  // "home" / "results" for the base view. When it changes, React builds
  // the wrapper below fresh and its entrance animation (.view-transition
  // in base.css) runs - so opening a book, moving to another book, going
  // back, and going home all animate the same way. A new search that
  // replaces one list of results with another keeps the key, so it
  // doesn't re-animate.
  let viewKey;
  if (selectedBookId !== null) {
    viewKey = `book-${selectedBookId}`;
  } else if (searchResults === null) {
    viewKey = "home";
  } else {
    viewKey = "results";
  }

  return (
    <>
      {/* Outside the animated wrapper: the search box stays put while the
          view under it changes. */}
      <SearchForm
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSubmit={handleSearchSubmit}
      />
      <div key={viewKey} className="view-transition">
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
            onSelectBook={openBook}
            // Same path as the browser's Back button: popstate opens the
            // previous book (showBook) or returns to the results (closeBook).
            onBack={() => window.history.back()}
          />
        )}
      </div>
    </>
  );
}
