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

import "./App.css";
import MainScreen from "./components/MainScreen";
import TaggingScreen from "./components/TaggingScreen";

// The two screens, in tab order. One list drives the tab buttons, so
// adding a screen means adding one entry here.
const SCREENS = [
  { id: "main", label: "חיפוש והמלצות" },
  { id: "tagging", label: "תיוג ספרים" },
];

export default function App() {
  // Which screen is showing. Toggled by the tab buttons below - no
  // router, no URL change (see DECISIONS.md).
  const [view, setView] = useState("main"); // main | tagging

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          {/* The site name is English inside a Hebrew page. lang="en" makes
              screen readers pronounce it as English. */}
          <h1 className="app-header__title" lang="en">
            Book-A-Like
          </h1>
          <p className="app-header__tagline">ספרים דומים בכתיבה, לא רק בנושא</p>
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
        </div>
      </header>
      <main className="app-main">
        {view === "main" ? <MainScreen /> : <TaggingScreen />}
      </main>
    </>
  );
}
