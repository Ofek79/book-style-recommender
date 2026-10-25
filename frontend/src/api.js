// Shared API helpers for the frontend: the base URL and the paging loop
// that both screens need. Kept in one place so the two copies of the
// offset loop can't drift apart (see DECISIONS.md).

// Base URL of the API, injected by Vite from VITE_API_URL (see .env).
export const API_URL = import.meta.env.VITE_API_URL;

// How many items to ask for per request - the API's own maximum for
// limit on GET /books.
export const PAGE_SIZE = 100;

// True in the public read-only build (VITE_READ_ONLY=true in
// .env.production - see DECISIONS.md). Only hides controls that would
// fail anyway: the backend's own READ_ONLY setting is what actually
// refuses writes. Read in this one place so every component agrees.
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === "true";

// Takes an API path (e.g. "/books") and an optional object of extra
// query parameters (e.g. { search: "har" }). Requests the path page by
// page, offset by PAGE_SIZE, until a page comes back short, and returns
// every item from every page as one array. Throws on any failed request,
// so the caller's own try/catch decides what to show. Exists because one
// GET /books call is capped at 100 items and the catalog is bigger.
export async function fetchAllPages(path, query = {}) {
  const items = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({ ...query, limit: PAGE_SIZE, offset });
    const response = await fetch(`${API_URL}${path}?${params}`);
    if (!response.ok) throw new Error(`GET ${path} failed`);
    const page = await response.json();
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return items;
}
