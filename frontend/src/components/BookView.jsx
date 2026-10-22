// Book view for the main screen: shown instead of the search results once
// a book is picked (see DECISIONS.md). MainScreen owns all the state;
// this component only displays it and reports actions back.

import { useEffect, useRef } from "react";

import "./BookView.css";
import GenreFilter from "./GenreFilter";
import RatingForm from "./RatingForm";
import RecommendationList from "./RecommendationList";
import StatusMessage from "./StatusMessage";

// Takes:
// - bookStatus ("loading" | "error" | "idle") and book (null until loaded)
// - recommendations and recommendationsStatus, passed on to RecommendationList
// - genreFilter and onGenreChange, passed on to GenreFilter
// - onRatingSaved, passed on to RatingForm
// - onBack, called by the "back to results" button
// Renders the title row with the back button, then a loading or error
// message, or the book itself: its rating form and its recommendations.
// The saved rating isn't repeated as a separate line - the form already
// opens showing it.
export default function BookView({
  bookStatus,
  book,
  recommendations,
  recommendationsStatus,
  genreFilter,
  onGenreChange,
  onRatingSaved,
  onBack,
}) {
  // Once the book's details arrive, move keyboard focus to its title.
  // Without this, focus stays on the (now hidden) result that was
  // clicked, and keyboard and screen-reader users are left nowhere.
  const titleRef = useRef(null);
  const bookId = book ? book.id : null;
  useEffect(() => {
    if (bookId !== null) {
      titleRef.current.focus();
    }
  }, [bookId]);

  // → points right: "back" in a right-to-left page.
  const backButton = (
    <button type="button" className="book-view__back" onClick={onBack}>
      → חזרה לתוצאות
    </button>
  );

  // While loading or on error there's no title yet, so the back button
  // stands alone above the message.
  if (book === null) {
    return (
      <section className="book-view">
        {backButton}
        {bookStatus === "loading" && (
          <StatusMessage variant="loading">טוענים את פרטי הספר</StatusMessage>
        )}
        {bookStatus === "error" && (
          <StatusMessage variant="error">טעינת פרטי הספר נכשלה. ודאו שהשרת רץ ונסו שוב.</StatusMessage>
        )}
      </section>
    );
  }

  return (
    <section className="book-view">
      <div className="book-view__header">
        <div className="book-view__heading">
          {/* tabIndex -1: focusable from code (see above), but not added
              to the Tab order, since it isn't a control. */}
          <h2 className="book-view__title" ref={titleRef} tabIndex={-1}>
            <bdi>{book.title}</bdi>
          </h2>
          <p className="book-view__author">
            <bdi>{book.author}</bdi>
          </p>
        </div>
        {backButton}
      </div>

      {/* key: a different book remounts the form, so its fields start
          from that book's rating instead of the previous one's. */}
      <RatingForm key={book.id} bookId={book.id} currentRating={book.rating} onSaved={onRatingSaved} />

      <div className="book-view__fleuron" aria-hidden="true">
        ❦
      </div>

      <div className="book-view__recommendations-header">
        <h3 className="book-view__recommendations-title">ספרים בסגנון דומה</h3>
        <div className="book-view__filter">
          <GenreFilter
            value={genreFilter}
            onChange={onGenreChange}
            descriptionId="genre-filter-hint"
          />
          {/* Changing the filter re-runs the recommendation over a
              different set of candidates - it doesn't just hide some of
              the books already shown - so new books can appear. Said
              up front, since it surprises people otherwise. */}
          <p className="book-view__filter-hint" id="genre-filter-hint">
            הסינון מחשב את ההמלצות מחדש, ולכן יכולים להופיע ספרים שלא היו ברשימה הקודמת.
          </p>
        </div>
      </div>
      <RecommendationList status={recommendationsStatus} recommendations={recommendations} />
    </section>
  );
}
