// Recommendations list for the selected book on the main screen.

import "./RecommendationList.css";
import RecommendationCard from "./RecommendationCard";
import StatusMessage from "./StatusMessage";

// Takes the recommendations request's status and its results (null | []
// | recommendations). Renders the right message for loading/error/
// not-tagged/no-book-selected-yet/no-results, or the list itself - one
// RecommendationCard per item. A low-rated book is shown like any other,
// in the order the server sent - the rating is information, not a
// filter (see DECISIONS.md).
//
// Two kinds of loading:
// - first load (nothing shown yet): the usual loading message
// - reload (e.g. the genre filter changed, cards already on screen): the
//   current cards fade down and stay in place with an "updating" note on
//   top, until the new ones arrive and animate in one after another (see
//   the CSS). No instant swap, and the page doesn't collapse to a message
//   and jump back, so it's clear the list is being refreshed.
export default function RecommendationList({ status, recommendations }) {
  const hasCards = recommendations !== null && recommendations.length > 0;
  const isReloading = status === "loading" && hasCards;

  if (status === "loading" && !hasCards) {
    return <StatusMessage variant="loading">מחפשים ספרים בסגנון דומה</StatusMessage>;
  }
  if (status === "not_tagged") {
    return (
      <StatusMessage variant="empty">
        את הספר הזה עוד לא תייגנו, ולכן אין לו המלצות. אפשר לתייג אותו במסך "תיוג ספרים".
      </StatusMessage>
    );
  }
  if (status === "error") {
    return <StatusMessage variant="error">טעינת ההמלצות נכשלה. ודאו שהשרת רץ ונסו שוב.</StatusMessage>;
  }
  if (recommendations === null) {
    return null; // no book selected yet
  }
  if (recommendations.length === 0) {
    return (
      <StatusMessage variant="empty">אין המלצות בסינון הזה. נסו לבחור "הכל".</StatusMessage>
    );
  }

  // Changes whenever a different set of books comes back, so React
  // replaces the <ul> and its fade-in animation runs again. If a reload
  // returns the very same books, the key is the same and nothing flashes.
  const listKey = recommendations.map((recommendation) => recommendation.book.id).join(",");

  return (
    <div className="recommendation-list-wrapper">
      {isReloading && (
        <p className="recommendation-list__updating" role="status">
          מעדכנים את ההמלצות
        </p>
      )}
      <ul
        key={listKey}
        className={isReloading ? "recommendation-list recommendation-list--reloading" : "recommendation-list"}
        // aria-busy tells screen readers this list is about to change.
        aria-busy={isReloading}
      >
        {recommendations.map((recommendation) => (
          <li key={recommendation.book.id}>
            <RecommendationCard recommendation={recommendation} />
          </li>
        ))}
      </ul>
    </div>
  );
}
