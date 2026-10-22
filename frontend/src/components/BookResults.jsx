// Search results for the main screen.

import BookCard from "./BookCard";
import "./BookResults.css";
import StatusMessage from "./StatusMessage";

// Takes the search request's status, its results (null | []  | books),
// and a callback for picking a book. Renders the right message for
// loading/error/no-search-yet/no-results, or the matches as a grid of
// BookCards with a short count above them.
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
    <>
      <p className="book-results__count">
        {results.length === 1 ? "נמצא ספר אחד" : `נמצאו ${results.length} ספרים`}
      </p>
      <ul className="book-results">
        {results.map((book) => (
          <li key={book.id}>
            <BookCard book={book} onSelect={onSelectBook} />
          </li>
        ))}
      </ul>
    </>
  );
}
