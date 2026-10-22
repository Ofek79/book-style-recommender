// Search results list for the main screen.

import StatusMessage from "./StatusMessage";

// Takes the search request's status, its results (null | []  | books),
// and a callback for picking a book. Renders the right message for
// loading/error/no-search-yet/no-results, or the list of matches.
// is_tagged is shown on each result so the user understands up front
// why an untagged book won't have recommendations.
export default function BookResults({ status, results, onSelectBook }) {
  if (status === "loading") {
    return <StatusMessage variant="loading">מחפשים</StatusMessage>;
  }
  if (status === "error") {
    return <StatusMessage variant="error">החיפוש נכשל. ודאו שהשרת רץ ונסו שוב.</StatusMessage>;
  }
  if (results === null) {
    return null; // no search submitted yet
  }
  if (results.length === 0) {
    return (
      <StatusMessage variant="empty">
        לא מצאנו ספר שהשם או המחבר שלו מתחילים כך. נסו את תחילת השם בלבד.
      </StatusMessage>
    );
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
