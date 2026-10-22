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

import MainScreen from "./components/MainScreen";
import TaggingScreen from "./components/TaggingScreen";

export default function App() {
  // Which screen is showing. Toggled by the two nav buttons below -
  // no router, no URL change (see DECISIONS.md).
  const [view, setView] = useState("main"); // main | tagging

  return (
    <main>
      <h1>מומלצי סגנון</h1>
      <nav>
        <button type="button" onClick={() => setView("main")}>
          חיפוש והמלצות
        </button>
        <button type="button" onClick={() => setView("tagging")}>
          תיוג ספרים
        </button>
      </nav>
      {view === "main" ? <MainScreen /> : <TaggingScreen />}
    </main>
  );
}
