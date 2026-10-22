// One component for every loading / error / empty message in the app, so
// they all look the same and announce themselves the same way.

import "./StatusMessage.css";

// Takes a variant ("loading" | "error" | "empty") and the message text as
// children. Renders it in the shared status style. role tells screen
// readers to announce the message when it appears: "alert" (right away)
// for an error, "status" (politely, when idle) for loading and empty.
// Exists so each list doesn't hand-roll its own <p> for these states.
export default function StatusMessage({ variant, children }) {
  return (
    <p
      className={`status-message status-message--${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
