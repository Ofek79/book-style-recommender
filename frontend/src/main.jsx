// Frontend entry point. Finds the #root element from index.html and renders
// the App component into it. This is the only place the app is mounted.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
