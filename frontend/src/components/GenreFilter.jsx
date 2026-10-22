// Genre filter for the recommendations list.

import "./GenreFilter.css";

// The three filter values, in display order, with their Hebrew labels.
const GENRE_OPTIONS = [
  { value: "any", label: "הכל" },
  { value: "same", label: "אותו ז'אנר" },
  { value: "different", label: "ז'אנר אחר" },
];

// Takes the current genre filter value and a change callback. Renders
// the any/same/different toggle as one segmented control: hidden radio
// inputs, each followed by its visible segment. Holds no state of its
// own - MainScreen owns genreFilter.
export default function GenreFilter({ value, onChange }) {
  return (
    <fieldset className="genre-filter">
      <legend className="visually-hidden">סינון לפי ז'אנר</legend>
      {GENRE_OPTIONS.map((option) => (
        <label key={option.value} className="genre-filter__option">
          <input
            className="genre-filter__input visually-hidden"
            type="radio"
            name="genre"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="genre-filter__text">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
