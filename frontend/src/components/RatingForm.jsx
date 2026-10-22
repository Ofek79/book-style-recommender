// Rating form for the selected book on the main screen.

import { useState } from "react";

import { API_URL } from "../api";
import Stars from "./Stars";

// The rating scale shown as radio buttons below - same 1-5 as the CHECK
// constraint in db/schema.sql.
const RATING_VALUES = [1, 2, 3, 4, 5];

// Takes a book id, the book's current rating (null | {rating, note}),
// and a callback for after a successful save. Renders 1-5 radio buttons
// and a note box, pre-filled from currentRating, and saves them with
// PUT /books/{id}/rating. Holds its own form state - it's only the
// draft until saved; MainScreen owns the saved rating. Works for any
// book, tagged or not (see DECISIONS.md).
export default function RatingForm({ bookId, currentRating, onSaved }) {
  const [rating, setRating] = useState(currentRating ? currentRating.rating : null);
  const [note, setNote] = useState(currentRating && currentRating.note ? currentRating.note : "");
  const [status, setStatus] = useState("idle"); // idle | loading | error | saved

  // Takes the submit event. Sends rating and note (a blank note is
  // stored as null by the server), then hands the saved row back to
  // MainScreen through onSaved.
  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    try {
      const response = await fetch(`${API_URL}/books/${bookId}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, note }),
      });
      if (!response.ok) throw new Error("save rating request failed");
      const saved = await response.json();
      setNote(saved.note ?? "");
      setStatus("saved");
      onSaved(saved);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset>
        <legend>{currentRating ? "עדכון הדירוג שלך" : "דרגו את הספר"}</legend>
        {RATING_VALUES.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              checked={rating === value}
              onChange={() => setRating(value)}
            />
            <Stars rating={value} />
          </label>
        ))}
        <label>
          הערה (אופציונלי)
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {/* Disabled until a star count is picked - the server requires one. */}
        <button type="submit" disabled={rating === null || status === "loading"}>
          שמירת דירוג
        </button>
      </fieldset>
      {status === "loading" && <p>שומר...</p>}
      {status === "error" && <p>שגיאה בשמירת הדירוג.</p>}
      {status === "saved" && <p>הדירוג נשמר.</p>}
    </form>
  );
}
