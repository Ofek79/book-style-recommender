// Full app: switches between the main screen (search a book, pick it,
// see style-similar recommendations) and the tagging screen (add books,
// tag their style attributes). The switch is a plain view state, not a
// router - see DECISIONS.md. No state library either, just useState and
// plain fetch calls, same as day 1. Each screen and its pieces live in
// src/components/, one component per file (see DECISIONS.md).
//
// UI text is Hebrew (the page is lang="he" dir="rtl" - see index.html);
// names, comments, and API calls stay English.

import { useState } from "react";

import { READ_ONLY } from "./api";
import "./App.css";
import MainScreen from "./components/MainScreen";
import TaggingScreen from "./components/TaggingScreen";

// The two screens, in tab order. One list drives the tab buttons, so
// adding a screen means adding one entry here.
const SCREENS = [
  { id: "main", label: "חיפוש והמלצות" },
  { id: "tagging", label: "תיוג ספרים" },
];

// In the public read-only build there's no tagging screen (see
// DECISIONS.md), which leaves a single screen - and a single tab is no
// choice at all, so the tab row isn't shown then.
const SHOW_TABS = !READ_ONLY;

export default function App() {
  // Which screen is showing. Toggled by the tab buttons below - no
  // router, no URL change (see DECISIONS.md).
  const [view, setView] = useState("main"); // main | tagging
  // Goes up by one each time the site title is clicked; MainScreen
  // treats each new value as "go back to the home screen".
  const [homeRequest, setHomeRequest] = useState(0);

  // Takes nothing. The site title's click handler: shows the main screen
  // and asks it to return to its home screen.
  function handleHomeClick() {
    setView("main");
    setHomeRequest((previous) => previous + 1);
  }

  return (
    <>
      <header className="app-header">
        <div
          className={
            SHOW_TABS ? "app-header__inner" : "app-header__inner app-header__inner--no-tabs"
          }
        >
          {/* The site name is English inside a Hebrew page. lang="en" makes
              screen readers pronounce it as English. It's also a button
              back to the home screen, as on most sites. */}
          <h1 className="app-header__title" lang="en">
            <button type="button" className="app-header__home" onClick={handleHomeClick}>
              Book-A-Like
            </button>
          </h1>
          <p className="app-header__tagline">ספרים דומים בכתיבה, לא רק בנושא</p>
          {SHOW_TABS && (
            <nav className="app-nav" aria-label="מסכים">
              {SCREENS.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  className={
                    view === screen.id ? "app-nav__tab app-nav__tab--active" : "app-nav__tab"
                  }
                  // Tells screen readers which tab is the current screen -
                  // the visual "active" style alone isn't announced.
                  aria-current={view === screen.id ? "page" : undefined}
                  onClick={() => setView(screen.id)}
                >
                  {screen.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="app-main">
        {/* key={view}: switching tabs builds the screen fresh, so it gets
            the same entrance animation as every other view change
            (.view-transition in base.css). */}
        <div key={view} className="view-transition">
          {view === "main" ? <MainScreen homeRequest={homeRequest} /> : <TaggingScreen />}
        </div>
      </main>
    </>
  );
}
