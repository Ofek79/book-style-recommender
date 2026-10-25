// "How it works" panel for the main screen, shown before the first
// search so a first-time visitor sees what the site does and can try it
// in one click.

import { READ_ONLY } from "../api";
import "./HowItWorks.css";

// Example books to try, picked to differ in style, not just genre:
// - הבתולות: short sentences, dark tone, a thriller
// - Pride and Prejudice: long sentences, lots of dialogue, ironic humor
// - One Hundred Years of Solitude: long, dense prose, slow, nonlinear
// Each title must match a book in the catalog, since clicking one runs a
// normal search for it (the user controls the catalog - see DECISIONS.md).
const EXAMPLE_TITLES = ["הבתולות", "Pride and Prejudice", "One Hundred Years of Solitude"];

// Takes a callback that runs a search for a given title. Renders the
// three steps, a note about ratings, and the example titles as buttons
// that call onTryExample. Holds no state of its own.
export default function HowItWorks({ onTryExample }) {
  return (
    <section className="how-it-works" aria-labelledby="how-it-works-title">
      <h2 className="how-it-works__title" id="how-it-works-title">
        איך זה עובד
      </h2>
      <ol className="how-it-works__steps">
        <li className="how-it-works__step">
          <span>
            <strong>חפשו ספר שאהבתם</strong>, לפי שם או מחבר.
          </span>
        </li>
        <li className="how-it-works__step">
          <span>
            <strong>בחרו אותו מהתוצאות.</strong>
          </span>
        </li>
        <li className="how-it-works__step">
          <span>
            <strong>קבלו ספרים שכתובים בסגנון דומה.</strong> לא בנושא דומה, אלא באורך
            המשפטים, בקצב, בטון ובגוף הסיפור. ליד כל המלצה מופיע הסבר למה היא התאימה.
          </span>
        </li>
      </ol>
      {/* Rating isn't possible in the public read-only build, so the
          sentence that offers it is left out there. */}
      {!READ_ONLY && (
        <p className="how-it-works__ratings">
          אפשר לדרג כל ספר ולהוסיף הערה. הדירוג מופיע ליד הספר בהמלצות.
        </p>
      )}
      <div className="how-it-works__examples">
        <span className="how-it-works__examples-label">נסו למשל:</span>
        {EXAMPLE_TITLES.map((title) => (
          <button
            key={title}
            type="button"
            className="how-it-works__example"
            onClick={() => onTryExample(title)}
          >
            <bdi>{title}</bdi>
          </button>
        ))}
      </div>
    </section>
  );
}
