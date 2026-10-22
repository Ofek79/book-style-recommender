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
export default function RecommendationList({ status, recommendations }) {
  if (status === "loading") {
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
