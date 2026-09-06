// The whole app for day 1: call the backend /health endpoint once on load
// and show the result. No routing, no state library - just useState/useEffect.

import { useEffect, useState } from "react";

// Base URL of the API, injected by Vite from VITE_API_URL (see .env).
const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
  // health holds one of: "loading", the server's status string, or "unreachable".
  const [health, setHealth] = useState("loading");

  useEffect(() => {
    // Ask the backend if it is up. Runs once, after the first render.
    fetch(`${API_URL}/health`)
      .then((response) => response.json())
      .then((data) => setHealth(data.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <main>
      <h1>Book Style Recommender</h1>
      <p>
        Backend health: <strong>{health}</strong>
      </p>
    </main>
  );
}
