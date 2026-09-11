"""
Database connection helper. Loads DATABASE_URL from the root .env file
and opens a psycopg connection to Postgres.
"""

import os

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

# Load the root .env file into the process environment once, at import
# time, so DATABASE_URL is available below. Vite does this automatically
# for the frontend; Python has no built-in equivalent.
load_dotenv()


# Takes nothing. Returns a new psycopg connection to the database, built
# from DATABASE_URL. Exists so every endpoint opens a connection the same
# way instead of repeating the connect() call.
#
# row_factory=dict_row makes query results come back as dicts (column
# name -> value) instead of plain tuples, so endpoint code can read
# row["title"] instead of counting column positions.
def get_connection():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)
