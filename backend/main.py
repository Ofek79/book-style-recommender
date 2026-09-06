"""
Server entry point. On day 1 there is a single endpoint: /health.
Run: uvicorn main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# The application object that every endpoint is registered on and uvicorn runs.
app = FastAPI(title="Book Style Recommender API")

# Let the browser call the API from a different origin (frontend on 5173, server on 8000).
# Without this the browser blocks the request from React due to the same-origin policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    # Checks that the server is alive and responding. Takes no input.
    # Returns the dict {"status": "ok"}, which becomes JSON automatically.
    # Exists so the frontend (and monitoring tools later) can verify the server is up.
    return {"status": "ok"}
