// Rating form for the open book: one row with clickable stars, a note,
// and a save button.

import { useState } from "react";

import { API_URL } from "../api";
import "./RatingForm.css";
import StarRatingInput from "./StarRatingInput";

// Takes a book id, the book's current rating (null | {rating, note}),
// and a callback for after a successful save. Renders the stars and a
// one-line note, pre-filled from currentRating, and saves them with
// PUT /books/{id}/rating. Holds its own form state - it's only the draft
// until saved; MainScreen owns the saved rating. Works for any book,
// tagged or not (see DECISIONS.md).
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
    <form className="rating-form" onSubmit={handleSubmit}>
      {/* Visible label for sighted users; the stars' own hidden legend
          names the group for screen readers, so this one is hidden from
          them to avoid reading it twice. */}
      <span className="rating-form__label" aria-hidden="true">
        הדירוג שלך
      </span>
      <StarRatingInput value={rating} onChange={setRating} name="rating" label="הדירוג שלך" />
      <input
        className="rating-form__note"
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="הערה (אופציונלי)"
        aria-label="הערה (אופציונלי)"
      />
      {/* Disabled until a star count is picked - the server requires one. */}
      <button type="submit" disabled={rating === null || status === "loading"}>
        שמירה
      </button>
      {/* role="status": a screen reader announces the result of saving
          without the user having to look for it. */}
      {status !== "idle" && (
        <p
          className={
            status === "error" ? "rating-form__status rating-form__status--error" : "rating-form__status"
          }
          role="status"
        >
          {status === "loading" && "שומרים..."}
          {status === "saved" && "הדירוג נשמר."}
          {status === "error" && "שמירת הדירוג נכשלה. ודאו שהשרת רץ ונסו שוב."}
        </p>
      )}
    </form>
  );
}
