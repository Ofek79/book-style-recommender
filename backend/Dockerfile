# Container image for the API, deployed to Cloud Run (see DECISIONS.md).
# Build from the repo root: docker build -t book-a-like-api backend

# Same Python minor version the project runs on locally (3.13). "slim" is
# the small Debian-based image: everything this app needs, without the
# compilers and tools of the full one. psycopg[binary] ships its own
# compiled driver, so nothing else has to be installed.
FROM python:3.13-slim

# Don't write .pyc files into the image, and print logs immediately
# instead of buffering them - so Cloud Run's log view shows them as they
# happen.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first, in their own layer: Docker reuses this layer on the
# next build as long as requirements.txt hasn't changed, so a code-only
# change doesn't reinstall every package.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Then the application code (filtered by .dockerignore).
COPY . .

# Run as an ordinary user, not root: if the app were ever compromised,
# the attacker wouldn't own the container.
RUN useradd --create-home appuser
USER appuser

# Cloud Run tells the container which port to listen on through $PORT
# (8080 by default); the fallback lets the image also run locally without
# setting it. Run through "sh -c" so ${PORT} is expanded - a plain JSON
# command wouldn't expand variables. exec then replaces the shell with
# uvicorn, so stop signals reach uvicorn directly and it shuts down
# cleanly.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
