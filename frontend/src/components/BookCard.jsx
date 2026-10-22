// One search result card.

import "./BookCard.css";

// Takes a book summary from GET /books (id, title, author, genre,
// is_tagged) and a click callback. Renders the whole card as one
// <button>, so it's clickable anywhere and works with Tab and Enter.
// Shows the genre as a tag, and a "not tagged" tag up front so the user
// knows before clicking that this book has no recommendations yet.
export default function BookCard({ book, onSelect }) {
  return (
    <button type="button" className="book-card" onClick={() => onSelect(book.id)}>
      <span className="book-card__title">
        <bdi>{book.title}</bdi>
      </span>
      <span className="book-card__author">
        <bdi>{book.author}</bdi>
      </span>
      {(book.genre || !book.is_tagged) && (
        <span className="book-card__tags">
          {book.genre && (
            <span className="book-card__tag">
              <bdi>{book.genre}</bdi>
            </span>
          )}
          {!book.is_tagged && (
            <span className="book-card__tag book-card__tag--untagged">לא מתויג</span>
          )}
        </span>
      )}
    </button>
  );
}
