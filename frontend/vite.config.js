// Vite build configuration for the frontend.
// The react() plugin adds JSX transform (automatic runtime) and Fast Refresh.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed port so it matches the CORS origin allowed by the backend.
    port: 5173,
    // Fail loudly if 5173 is taken instead of silently moving to another port
    // that the backend CORS list would then reject.
    strictPort: true,
  },
});
