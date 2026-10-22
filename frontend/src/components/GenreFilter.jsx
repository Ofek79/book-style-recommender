// Genre filter for the recommendations list.

// Takes the current genre filter value and a change callback. Renders
// the any/same/different toggle as a radio group. Holds no state of
// its own - MainScreen owns genreFilter.
export default function GenreFilter({ value, onChange }) {
  return (
    <fieldset>
      <legend>סינון לפי ז'אנר</legend>
      <label>
        <input
          type="radio"
          name="genre"
          value="any"
          checked={value === "any"}
          onChange={() => onChange("any")}
        />
        הכל
      </label>
      <label>
        <input
          type="radio"
          name="genre"
          value="same"
          checked={value === "same"}
          onChange={() => onChange("same")}
        />
        אותו ז'אנר
      </label>
      <label>
        <input
          type="radio"
          name="genre"
          value="different"
          checked={value === "different"}
          onChange={() => onChange("different")}
        />
        ז'אנר אחר
      </label>
    </fieldset>
  );
}
