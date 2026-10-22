// Search box for the main screen.

import "./SearchForm.css";

// Takes the current search term, a setter for it, and a submit handler.
// Renders the search box as a controlled input. Holds no state of its
// own - MainScreen owns searchTerm, this just displays it and reports
// changes.
export default function SearchForm({ searchTerm, onSearchTermChange, onSubmit }) {
  return (
    <form className="search-form" role="search" onSubmit={onSubmit}>
      <input
        className="search-form__input"
        type="text"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="חיפוש ספר לפי שם או מחבר..."
        // A placeholder disappears once you type and isn't a reliable
        // label for screen readers - aria-label names the field.
        aria-label="חיפוש ספר לפי שם או מחבר"
      />
      <button type="submit">חיפוש</button>
    </form>
  );
}
