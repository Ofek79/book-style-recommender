// Search box for the main screen.

// Takes the current search term, a setter for it, and a submit handler.
// Renders the search box as a controlled input. Holds no state of its
// own - MainScreen owns searchTerm, this just displays it and reports
// changes.
export default function SearchForm({ searchTerm, onSearchTermChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <input
        type="text"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="חיפוש ספר לפי שם או מחבר..."
      />
      <button type="submit">חיפוש</button>
    </form>
  );
}
