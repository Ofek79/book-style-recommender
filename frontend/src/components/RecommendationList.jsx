// Recommendations list for the selected book on the main screen.

import "./RecommendationList.css";
import RecommendationCard from "./RecommendationCard";

// Takes the recommendations request's status and its results (null | []
// | recommendations). Renders the right message for loading/error/
// not-tagged/no-book-selected-yet/no-results, or the list itself - one
// RecommendationCard per item. A low-rated book is shown like any other,
// in the order the server sent - the rating is information, not a
// filter (see DECISIONS.md).
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
    <ul className="recommendation-list">
      {recommendations.map((recommendation) => (
        <li key={recommendation.book.id}>
          <RecommendationCard recommendation={recommendation} />
        </li>
      ))}
    </ul>
  );
}
