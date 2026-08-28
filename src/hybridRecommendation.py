import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None


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
        raise ValueError("Missing required MYSQL env vars (MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE).")
    password_encoded = quote_plus(password)
    db_url = f"mysql+mysqlconnector://{user}:{password_encoded}@{host}/{database}"
    return create_engine(db_url)


def cosine_similarity_1d(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    a_vec = np.asarray(a, dtype=float)
    b_vec = np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(a_vec) * np.linalg.norm(b_vec))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a_vec, b_vec) / denom)


def get_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    load_env_file()
    if OpenAI is None:
        raise RuntimeError("OpenAI package not installed")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)
    normalized = text.replace("\n", " ").strip()[:8000]
    response = client.embeddings.create(model=model, input=normalized)
    return response.data[0].embedding


def calculate_similarity_score(
    target: dict,
    candidate: dict,
    target_emb: list[float],
    candidate_emb: list[float],
) -> float:
    score = 0.0

    target_price = float(target.get("L_SystemPrice") or 0)
    candidate_price = float(candidate.get("L_SystemPrice") or 0)
    price_diff = abs(target_price - candidate_price)
    if price_diff < 50_000:
        score += 20
    elif price_diff < 150_000:
        score += 12
    elif price_diff < 300_000:
        score += 5

    if (target.get("L_Keyword2") or 0) == (candidate.get("L_Keyword2") or 0):
        score += 15
    if (target.get("L_City") or "") == (candidate.get("L_City") or ""):
        score += 15

    target_sqft = float(target.get("LM_Int2_3") or 0)
    candidate_sqft = float(candidate.get("LM_Int2_3") or 0)
    sqft_diff = abs(target_sqft - candidate_sqft)
    if sqft_diff < 300:
        score += 10
    elif sqft_diff < 700:
        score += 5

    sem_sim = cosine_similarity_1d(target_emb, candidate_emb)
    score += sem_sim * 40
    return round(score, 2)


def validate_with_comps(city: str, sqft: int, price: int) -> dict:
    engine = build_engine()
    sql = """
    SELECT
      AVG(ClosePrice / NULLIF(LivingArea,0)) AS avg_ppsf,
      COUNT(*) AS comp_count
    FROM california_sold
    WHERE City = %s AND PropertyType = 'Residential'
      AND LivingArea BETWEEN %s AND %s
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    """
    lower_sqft = int(sqft * 0.8)
    upper_sqft = int(sqft * 1.2)
    df = pd.read_sql(sql, engine, params=(city, lower_sqft, upper_sqft))

    avg_ppsf = float((df.iloc[0].get("avg_ppsf") if not df.empty else 0) or 0)
    comp_count = int((df.iloc[0].get("comp_count") if not df.empty else 0) or 0)
    comp_price = round(avg_ppsf * sqft) if avg_ppsf > 0 and sqft > 0 else 0
    delta_pct = round(((price - comp_price) / comp_price) * 100, 1) if comp_price > 0 else 0.0

    return {
        "comp_price": comp_price,
        "list_price": int(price),
        "comp_count": comp_count,
        "delta_pct": delta_pct,
    }


def listing_text(row: dict) -> str:
    return (
        f"{row.get('L_Type_', '')} in {row.get('L_City', '')}. "
        f"{row.get('L_Keyword2', '')} beds, {row.get('LM_Dec_3', '')} baths. "
        f"{row.get('LM_Int2_3', '')} sqft. Price {row.get('L_SystemPrice', 0)}. "
        f"{row.get('L_Remarks', '')}"
    ).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-address", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--candidate-limit", type=int, default=120)
    args = parser.parse_args()

    engine = build_engine()
    target_sql = """
    SELECT L_Address, L_City, L_Zip, L_SystemPrice, L_Keyword2, LM_Dec_3, LM_Int2_3, L_Type_, L_Remarks
    FROM rets_property
    WHERE L_Status = 'Active' AND LOWER(L_Address) = LOWER(%s)
    LIMIT 1
    """
    target_df = pd.read_sql(target_sql, engine, params=(args.target_address,))
    if target_df.empty:
        print(json.dumps({"error": "Target active listing not found."}))
        return

    target_row = target_df.where(pd.notnull(target_df), None).to_dict(orient="records")[0]
    candidates_sql = """
    SELECT L_Address, L_City, L_Zip, L_SystemPrice, L_Keyword2, LM_Dec_3, LM_Int2_3, L_Type_, L_Remarks
    FROM rets_property
    WHERE L_Status = 'Active' AND LOWER(L_Address) <> LOWER(%s)
    ORDER BY ModificationTimestamp DESC
    LIMIT %s
    """
    candidates_df = pd.read_sql(candidates_sql, engine, params=(args.target_address, args.candidate_limit))
    candidates = candidates_df.where(pd.notnull(candidates_df), None).to_dict(orient="records")

    target_emb = get_embedding(listing_text(target_row))
    scored = []
    for candidate in candidates:
        candidate_emb = get_embedding(listing_text(candidate))
        sim_score = calculate_similarity_score(target_row, candidate, target_emb, candidate_emb)
        comp = validate_with_comps(
            str(candidate.get("L_City") or ""),
            int(float(candidate.get("LM_Int2_3") or 0)),
            int(float(candidate.get("L_SystemPrice") or 0)),
        )
        scored.append({**candidate, "similarity_score": sim_score, **comp})

    scored.sort(key=lambda item: item["similarity_score"], reverse=True)
    top_k = args.top_k if args.top_k > 0 else 5
    print(json.dumps({"target": target_row, "results": scored[:top_k]}, default=str))


if __name__ == "__main__":
    main()
