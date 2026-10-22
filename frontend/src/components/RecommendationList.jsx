// Recommendations list for the selected book on the main screen.

import Stars from "./Stars";

// Takes the recommendations request's status and its results (null | []
// | recommendations). Renders the right message for loading/error/
// not-tagged/no-book-selected-yet/no-results, or the list itself - each
// item with its similarity score, its rationale sentences, a bookstore
// search link, and the reader's rating and note if the book is rated.
// A low-rated book is shown like any other, in the order the server
// sent - the rating is information, not a filter (see DECISIONS.md).
export default function RecommendationList({ status, recommendations }) {
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
              הדירוג שלך: <Stars rating={recommendation.book.rating.rating} />
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
