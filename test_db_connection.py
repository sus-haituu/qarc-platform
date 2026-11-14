"""Neon Postgres connection & schema verification check (prints no secrets)."""
from qarc_db import execute_with_retry, init_db


def main() -> None:
    init_db()

    def _inspect(conn):
        with conn.cursor() as cur:
            cur.execute("SELECT version(), current_database(), current_user;")
            ver, db, user = cur.fetchone()
            cur.execute("SELECT extversion FROM pg_extension WHERE extname='vector';")
            vec_row = cur.fetchone()
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' ORDER BY 1;"
            )
            tables = [r[0] for r in cur.fetchall()]
            return ver, db, user, (vec_row[0] if vec_row else "NOT INSTALLED"), tables

    ver, db, user, pgvector_ver, tables = execute_with_retry(_inspect)
    print("Connected OK")
    print("  server  :", ver.split(",")[0])
    print("  database:", db)
    print("  user    :", user)
    print("  pgvector:", pgvector_ver)
    print("  tables  :", tables or "(none yet)")


if __name__ == "__main__":
    main()
