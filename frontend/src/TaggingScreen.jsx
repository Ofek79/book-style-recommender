// Tagging screen: add a new book, then tag it (or any other untagged
// book) with its 10 style attributes. Separate from the main search
// screen (see App.jsx) - switched to by a plain view-state toggle, no
// routing library.
//
// UI text is Hebrew, same as App.jsx; names, comments, and API calls
// stay English.

import { useEffect, useState } from "react";

// Base URL of the API, injected by Vite from VITE_API_URL (see .env).
const API_URL = import.meta.env.VITE_API_URL;

// How many books to ask for per GET /books call - the API's own maximum
// for limit. The catalog is bigger than one page, so the untagged list
// is loaded page by page (see loadUntaggedBooks).
const PAGE_SIZE = 100;

// Default values for a fresh style-attributes form: the middle of each
// 1-5 scale, the most common option for each category, and false for
// every boolean - except is_present_tense, which starts as null
// ("unknown"), so forgetting to choose leaves a gap, not a wrong value
// (see DECISIONS.md). These are just a starting point for a new tag,
// not a claim about any particular book.
const DEFAULT_STYLE_FORM = {
  sentence_length: "medium",
  description_density: 3,
  dialogue_ratio: "medium",
  pov: "third_limited",
  is_present_tense: null,
  tone: 3,
  pacing: 3,
  vocabulary_complexity: 3,
  is_nonlinear: false,
  has_humor: false,
};

// Hebrew labels for each dropdown's stored (English) values. Kept here,
// separate from the matching labels in backend/similarity.py, because
// the two serve different purposes: this renders form options, that
// builds rationale sentences. Duplicated on purpose rather than fetched
// from the backend, to keep this a plain form with no extra endpoint.
const SENTENCE_LENGTH_OPTIONS = [
  { value: "short", label: "קצר" },
  { value: "medium", label: "בינוני" },
  { value: "long", label: "ארוך" },
];
const DIALOGUE_RATIO_OPTIONS = [
  { value: "low", label: "נמוך" },
  { value: "medium", label: "בינוני" },
  { value: "high", label: "גבוה" },
];
const POV_OPTIONS = [
  { value: "first", label: "גוף ראשון" },
  { value: "third_limited", label: "גוף שלישי מוגבל" },
  { value: "third_omniscient", label: "גוף שלישי יודע-כל" },
  { value: "second", label: "גוף שני" },
];
// is_present_tense has three states (null / false / true), so it's a
// dropdown, not a checkbox. A <select> value is always a string, so each
// option's string maps back to the real value through this lookup.
const PRESENT_TENSE_OPTIONS = [
  { value: "null", label: "לא ידוע" },
  { value: "false", label: "זמן עבר" },
  { value: "true", label: "זמן הווה" },
];
const PRESENT_TENSE_VALUES = { null: null, false: false, true: true };
const LANGUAGE_OPTIONS = [
  { value: "he", label: "עברית" },
  { value: "en", label: "אנגלית" },
];

export default function TaggingScreen() {
  // New-book form fields and its request status.
  const [newBook, setNewBook] = useState({
    title: "",
    author: "",
    titleOriginal: "",
    genre: "",
    language: "he",
  });
  const [addBookStatus, setAddBookStatus] = useState("idle"); // idle | loading | error | success

  // Untagged books: null before the first load, [] if none are left.
  const [untaggedBooks, setUntaggedBooks] = useState(null);
  const [untaggedStatus, setUntaggedStatus] = useState("idle"); // idle | loading | error

  // The book currently being tagged (picked from the untagged list) and
  // its style-attributes form.
  const [bookBeingTagged, setBookBeingTagged] = useState(null);
  const [styleForm, setStyleForm] = useState(DEFAULT_STYLE_FORM);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | loading | error | success

  // Takes nothing. Calls GET /books page by page (offset by PAGE_SIZE
  // until a page comes back short - one call is capped at 100 books)
  // for the whole catalog, and keeps only the untagged ones
  // (is_tagged === false) - no separate backend filter needed for this.
  // Exists so the untagged list can be refreshed after adding or
  // tagging a book, not just on first load.
  async function loadUntaggedBooks() {
    setUntaggedStatus("loading");
    try {
      const books = [];
      let offset = 0;
      while (true) {
        const response = await fetch(`${API_URL}/books?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!response.ok) throw new Error("books request failed");
        const page = await response.json();
        books.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setUntaggedBooks(books.filter((book) => !book.is_tagged));
      setUntaggedStatus("idle");
    } catch {
      setUntaggedBooks(null);
      setUntaggedStatus("error");
    }
  }

  // Load the untagged list once when this screen first renders.
  useEffect(() => {
    loadUntaggedBooks();
  }, []);

  // Takes the submit event from the add-book form. Posts newBook to
  // POST /books, then clears the form and refreshes the untagged list
  // so the new book shows up right away. Reads a 409 explicitly (same
  // title+author already exists) since it needs a different message
  // than a generic failure.
  async function handleAddBookSubmit(event) {
    event.preventDefault();
    setAddBookStatus("loading");
    try {
      const response = await fetch(`${API_URL}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBook.title,
          author: newBook.author,
          title_original: newBook.titleOriginal || null,
          genre: newBook.genre || null,
          language: newBook.language,
        }),
      });
      if (response.status === 409) {
        setAddBookStatus("duplicate");
        return;
      }
      if (!response.ok) throw new Error("create book request failed");
      setNewBook({ title: "", author: "", titleOriginal: "", genre: "", language: "he" });
      setAddBookStatus("success");
      loadUntaggedBooks();
    } catch {
      setAddBookStatus("error");
    }
  }

  // Takes a book from the untagged list. Starts tagging it: resets the
  // style-attributes form to its defaults and clears any earlier save
  // status, so switching between books never carries over stale values.
  function handleSelectBookToTag(book) {
    setBookBeingTagged(book);
    setStyleForm(DEFAULT_STYLE_FORM);
    setSaveStatus("idle");
  }

  // Takes one style-attribute field name and its new value. Updates
  // just that field in styleForm - one shared handler instead of a
  // separate onChange function per field.
  function handleStyleFormChange(field, value) {
    setStyleForm((previous) => ({ ...previous, [field]: value }));
  }

  // Takes the submit event from the style-attributes form. Sends
  // styleForm, plus tagged_by: "manual" (this form is the manual
  // tagger - see DECISIONS.md), to PUT /books/{id}/style-attributes for
  // bookBeingTagged.
  // On success, the book is tagged, so it's cleared from this screen
  // and the untagged list is refreshed (the book will no longer appear
  // in it).
  async function handleSaveStyleSubmit(event) {
    event.preventDefault();
    setSaveStatus("loading");
    try {
      const response = await fetch(
        `${API_URL}/books/${bookBeingTagged.id}/style-attributes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...styleForm, tagged_by: "manual" }),
        },
      );
      if (!response.ok) throw new Error("save style attributes request failed");
      setBookBeingTagged(null);
      setSaveStatus("idle");
      loadUntaggedBooks();
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <div>
      <h2>הוספת ספר</h2>
      <form onSubmit={handleAddBookSubmit}>
        <label>
          כותרת
          <input
            type="text"
            required
            value={newBook.title}
            onChange={(event) => setNewBook({ ...newBook, title: event.target.value })}
          />
        </label>
        <label>
          מחבר
          <input
            type="text"
            required
            value={newBook.author}
            onChange={(event) => setNewBook({ ...newBook, author: event.target.value })}
          />
        </label>
        <label>
          כותרת מקורית (אופציונלי, לספר מתורגם)
          <input
            type="text"
            value={newBook.titleOriginal}
            onChange={(event) => setNewBook({ ...newBook, titleOriginal: event.target.value })}
          />
        </label>
        <label>
          ז'אנר (אופציונלי)
          <input
            type="text"
            value={newBook.genre}
            onChange={(event) => setNewBook({ ...newBook, genre: event.target.value })}
          />
        </label>
        <label>
          שפה
          <select
            value={newBook.language}
            onChange={(event) => setNewBook({ ...newBook, language: event.target.value })}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">הוספת ספר</button>
      </form>
      {addBookStatus === "loading" && <p>שומר...</p>}
      {addBookStatus === "error" && <p>שגיאה בהוספת הספר. ודאו שכל השדות תקינים.</p>}
      {addBookStatus === "duplicate" && <p>ספר עם כותרת ומחבר זהים כבר קיים במאגר.</p>}
      {addBookStatus === "success" && <p>הספר נוסף בהצלחה.</p>}

      <h2>ספרים לא מתויגים</h2>
      {untaggedStatus === "loading" && <p>טוען...</p>}
      {untaggedStatus === "error" && <p>שגיאה בטעינת הרשימה. ודאו שהשרת רץ.</p>}
      {untaggedStatus === "idle" && untaggedBooks !== null && untaggedBooks.length === 0 && (
        <p>כל הספרים בקטלוג מתויגים.</p>
      )}
      {untaggedStatus === "idle" && untaggedBooks !== null && untaggedBooks.length > 0 && (
        <ul>
          {untaggedBooks.map((book) => (
            <li key={book.id}>
              <button type="button" onClick={() => handleSelectBookToTag(book)}>
                {book.title} — {book.author}
              </button>
            </li>
          ))}
        </ul>
      )}

      {bookBeingTagged && (
        <section>
          <h2>
            תיוג סגנון: {bookBeingTagged.title} — {bookBeingTagged.author}
          </h2>
          <form onSubmit={handleSaveStyleSubmit}>
            <label>
              אורך משפטים
              <select
                value={styleForm.sentence_length}
                onChange={(event) => handleStyleFormChange("sentence_length", event.target.value)}
              >
                {SENTENCE_LENGTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              צפיפות תיאור ({styleForm.description_density})
              <input
                type="range"
                min="1"
                max="5"
                value={styleForm.description_density}
                onChange={(event) =>
                  handleStyleFormChange("description_density", Number(event.target.value))
                }
              />
            </label>

            <label>
              יחס דיאלוג
              <select
                value={styleForm.dialogue_ratio}
                onChange={(event) => handleStyleFormChange("dialogue_ratio", event.target.value)}
              >
                {DIALOGUE_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              גוף הסיפור
              <select
                value={styleForm.pov}
                onChange={(event) => handleStyleFormChange("pov", event.target.value)}
              >
                {POV_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              זמן דקדוקי
              <select
                value={String(styleForm.is_present_tense)}
                onChange={(event) =>
                  handleStyleFormChange(
                    "is_present_tense",
                    PRESENT_TENSE_VALUES[event.target.value],
                  )
                }
              >
                {PRESENT_TENSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              טון ({styleForm.tone})
              <input
                type="range"
                min="1"
                max="5"
                value={styleForm.tone}
                onChange={(event) => handleStyleFormChange("tone", Number(event.target.value))}
              />
            </label>

            <label>
              קצב ({styleForm.pacing})
              <input
                type="range"
                min="1"
                max="5"
                value={styleForm.pacing}
                onChange={(event) => handleStyleFormChange("pacing", Number(event.target.value))}
              />
            </label>

            <label>
              מורכבות אוצר מילים ({styleForm.vocabulary_complexity})
              <input
                type="range"
                min="1"
                max="5"
                value={styleForm.vocabulary_complexity}
                onChange={(event) =>
                  handleStyleFormChange("vocabulary_complexity", Number(event.target.value))
                }
              />
            </label>

            <label>
              <input
                type="checkbox"
                checked={styleForm.is_nonlinear}
                onChange={(event) => handleStyleFormChange("is_nonlinear", event.target.checked)}
              />
              מבנה לא-ליניארי
            </label>

            <label>
              <input
                type="checkbox"
                checked={styleForm.has_humor}
                onChange={(event) => handleStyleFormChange("has_humor", event.target.checked)}
              />
              הומור
            </label>

            <button type="submit">שמירת תיוג</button>
          </form>
          {saveStatus === "loading" && <p>שומר...</p>}
          {saveStatus === "error" && <p>שגיאה בשמירת התיוג.</p>}
        </section>
      )}
    </div>
  );
}
