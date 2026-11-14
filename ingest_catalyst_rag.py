"""
Q-ARC E08 Institutional Filings & Catalyst RAG Ingestion CLI
=============================================================
Builds timestamped catalyst documents strictly from real repository sources
(`fetch_data.fetch_historical_bulk_block_deals` and `fetch_news.fetch_headlines`),
embeds them with Gemini `gemini-embedding-001` (`outputDimensionality=768`),
and upserts them into Neon Postgres `nse_catalyst_rag`.
"""
from collections import Counter

from qarc_vector_memory import build_real_catalyst_docs, upsert_catalysts_to_neon


def main() -> None:
    print("=" * 72)
    print("📰 Q-ARC E08 REAL CATALYST RAG INGESTION (GEMINI 768D + NEON PGVECTOR)")
    print("=" * 72)

    docs = build_real_catalyst_docs()
    source_counts = Counter(d.get("source", "unknown") for d in docs)
    cat_counts = Counter(d.get("category", "CATALYST") for d in docs)
    unique_syms = len({d["symbol"] for d in docs})

    print(f"Collected {len(docs)} real catalyst docs across {unique_syms} symbols.")
    print(f"Sources   : {dict(source_counts)}")
    print(f"Categories: {dict(cat_counts)}")

    stats = upsert_catalysts_to_neon(docs=docs)
    print(
        f"Neon Postgres upsert (nse_catalyst_rag): "
        f"before={stats['rows_before']:,}, upserted={stats['rows_upserted']:,}, after={stats['rows_after']:,}"
    )
    print("=" * 72)


if __name__ == "__main__":
    main()
