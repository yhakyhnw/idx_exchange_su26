import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None

client = OpenAI() if OpenAI is not None else None


def cosine_similarity_1d(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    a_vec = np.asarray(a, dtype=float)
    b_vec = np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(a_vec) * np.linalg.norm(b_vec))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a_vec, b_vec) / denom)


def load_env_file() -> None:
    root_env = Path(__file__).resolve().parents[1] / ".env"
    if not root_env.exists():
        return

    for raw_line in root_env.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def build_engine():
    load_env_file()

    host = os.environ.get("MYSQL_HOST")
    user = os.environ.get("MYSQL_USER")
    password = os.environ.get("MYSQL_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE")

    if not host or not user or not database:
        raise ValueError(
            "Missing required MYSQL env vars (MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE)."
        )

    password_encoded = quote_plus(password)
    db_url = f"mysql+mysqlconnector://{user}:{password_encoded}@{host}/{database}"
    return create_engine(db_url)


def get_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    if client is None:
        raise RuntimeError("OpenAI client unavailable")
    text = text.replace("\n", " ").strip()[:8000]  # max token safety
    response = client.embeddings.create(model=model, input=text)
    return response.data[0].embedding


def score_with_tfidf(query: str, rows: list[dict]) -> list[dict]:
    def tokenize(text: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", text.lower()))

    query_tokens = tokenize(query)
    scored = []
    for row in rows:
        text = " ".join(
            str(value)
            for value in [
                row.get("L_Address", ""),
                row.get("L_City", ""),
                row.get("L_Zip", ""),
                row.get("L_Type_", ""),
                row.get("L_Keyword2", ""),
                row.get("LM_Dec_3", ""),
                row.get("LM_Int2_3", ""),
                row.get("L_Remarks", ""),
            ]
            if value not in (None, "")
        )
        listing_tokens = tokenize(text)
        union = query_tokens | listing_tokens
        sim = (len(query_tokens & listing_tokens) / len(union)) if union else 0.0
        scored.append({**row, "_similarity": float(sim)})

    scored.sort(key=lambda item: item["_similarity"], reverse=True)
    return scored


def build_listing_embedding(row: dict) -> list[float]:
    text = f"""
{row.get("L_Type_", "")} in {row.get("L_City", "")}, CA.
{row.get("L_Keyword2", "")} beds, {row.get("LM_Dec_3", "")} baths.
{row.get("LM_Int2_3", "")} sq ft. Built {row.get("YearBuilt", "")}.
Price: ${row.get("L_SystemPrice", 0):,}.
{row.get("L_Remarks", "")}
""".strip()
    return get_embedding(text)


def find_similar_listings(
    query: str,
    listing_embeddings: list[tuple[str, list[float]]],
    top_k: int = 5,
) -> list[str]:
    """Return top_k listing IDs most similar to the query."""
    query_vec = np.array(get_embedding(query)).reshape(1, -1)
    scores: list[tuple[str, float]] = []

    for listing_id, emb in listing_embeddings:
        sim = cosine_similarity(query_vec, np.array(emb).reshape(1, -1))[0][0]
        scores.append((listing_id, float(sim)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [listing_id for listing_id, _ in scores[:top_k]]


def fetch_active_listing_candidates(limit: int = 120) -> list[dict]:
    engine = build_engine()
    query = """
    SELECT
      L_Address,
      L_City,
      L_Zip,
      L_SystemPrice,
      L_Keyword2,
      LM_Dec_3,
      LM_Int2_3,
      L_Type_,
      L_Remarks,
      YearBuilt
    FROM rets_property
    WHERE L_Status = 'Active'
    ORDER BY ModificationTimestamp DESC
    LIMIT %s
    """
    df = pd.read_sql(query, engine, params=(limit,))
    if df.empty:
        return []
    cleaned = df.where(pd.notnull(df), None)
    return cleaned.to_dict(orient="records")


def rank_similar_active_listings(
    query: str, top_k: int = 5, candidate_limit: int = 120
) -> list[dict]:
    rows = fetch_active_listing_candidates(candidate_limit)
    if not rows:
        return []

    try:
        query_vec = np.array(get_embedding(query)).reshape(1, -1)
        scored: list[dict] = []

        for row in rows:
            listing_vec = np.array(build_listing_embedding(row)).reshape(1, -1)
            sim = cosine_similarity_1d(query_vec.ravel(), listing_vec.ravel())
            scored.append({**row, "_similarity": float(sim)})

        scored.sort(key=lambda item: item["_similarity"], reverse=True)
        return scored[:top_k]
    except Exception:
        scored = score_with_tfidf(query, rows)
        return scored[:top_k]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--candidate-limit", type=int, default=120)
    args = parser.parse_args()

    top_k = args.top_k if args.top_k > 0 else 5
    candidate_limit = args.candidate_limit if args.candidate_limit > 0 else 120
    results = rank_similar_active_listings(
        query=args.query, top_k=top_k, candidate_limit=candidate_limit
    )

    print(
        json.dumps(
            {
                "query": args.query,
                "top_k": top_k,
                "candidate_limit": candidate_limit,
                "results": results,
            },
            default=str,
        )
    )


if __name__ == "__main__":
    main()
