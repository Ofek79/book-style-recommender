// Frontend entry point. Finds the #root element from index.html and renders
// the App component into it. This is the only place the app is mounted.
// It's also where the shared base styles are imported, once, before any
// component - so every component's own CSS builds on them.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/base.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
