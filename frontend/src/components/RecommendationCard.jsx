// One recommendation card in the recommendations list.

import "./RecommendationCard.css";
import Stars from "./Stars";

// Takes one recommendation from GET /books/{id}/recommendations (book,
// similarity_score, rationale, bookstore_search_url) and a callback that
// opens a book. Renders the title, author and bookstore link together at
// the top, then the match score as a percentage and the reader's rating
// if there is one, then the rationale sentences. The title is a button
// that opens this book's own recommendations - book-to-book navigation.
// Only the title, not the whole card: the card also holds the bookstore
// link, and a link inside a button is invalid HTML that breaks keyboard
// and screen-reader use. The score arrives as 0-1; it's shown as a
// rounded percentage only here - sorting already happened on the server,
// on the full-precision score (see DECISIONS.md).
export default function RecommendationCard({ recommendation, onSelectBook }) {
  const { book, similarity_score, rationale, bookstore_search_url } = recommendation;
  const matchPercent = Math.round(similarity_score * 100);

  return (
    <article className="recommendation-card">
      <header className="recommendation-card__header">
        <div>
          <h3 className="recommendation-card__title">
            <button
              type="button"
              className="recommendation-card__open"
              onClick={() => onSelectBook(book.id)}
            >
              <bdi>{book.title}</bdi>
            </button>
          </h3>
          <p className="recommendation-card__author">
            <bdi>{book.author}</bdi>
          </p>
        </div>
        <a
          className="recommendation-card__store"
          href={bookstore_search_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          חיפוש בחנות ספרים
        </a>
      </header>

      <div className="recommendation-card__meta">
        <span className="recommendation-card__match">{matchPercent}% התאמה</span>
        {book.rating && (
          <span>
            <span
              className="recommendation-card__stars"
              role="img"
              aria-label={`הדירוג שלך: ${book.rating.rating} מתוך 5`}
            >
              <Stars rating={book.rating.rating} />
            </span>
            {book.rating.note && (
              <span className="recommendation-card__note"> — {book.rating.note}</span>
            )}
          </span>
        )}
      </div>

      <ul className="recommendation-card__rationale">
        {rationale.map((sentence, index) => (
          <li key={index}>{sentence}</li>
        ))}
      </ul>
    </article>
  );
}
