// Clickable 1-5 star input, used by RatingForm. Looks like stars, but
// underneath it's a normal radio group (see DECISIONS.md), so keyboard
// arrows, Tab, and screen-reader wording ("3 מתוך 5") all come from the
// browser for free.

import { Fragment } from "react";

import "./StarRatingInput.css";

// Highest first: the CSS shows them in reverse, and needs this order to
// light up "the hovered star and every lower one" (see the CSS file).
const STAR_VALUES = [5, 4, 3, 2, 1];

// Takes the current value (1-5, or null if nothing is picked yet), a
// change callback, a name for the radio group (unique on the page), and
// a label for screen readers. Renders five hidden radio inputs, each
// with a star as its visible label. Holds no state of its own - the
// parent owns the value.
export default function StarRatingInput({ value, onChange, name, label }) {
  return (
    <fieldset className="star-rating">
      <legend className="visually-hidden">{label}</legend>
      {STAR_VALUES.map((star) => (
        // A fragment, not a wrapper: each input must be followed directly
        // by its own label, and labels must be siblings of each other, for
        // the CSS sibling selectors to work.
        <Fragment key={star}>
          <input
            className="star-rating__input visually-hidden"
            type="radio"
            id={`${name}-${star}`}
            name={name}
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
          />
          <label className="star-rating__star" htmlFor={`${name}-${star}`}>
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{star} מתוך 5</span>
          </label>
        </Fragment>
      ))}
    </fieldset>
  );
}
