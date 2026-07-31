import argparse
import json
import os
import subprocess
import sys
from typing import Any

from embeddings import build_listing_embedding
from vector_search import rank_listing_embeddings


def _load_env_from_dotenv_if_needed() -> None:
    needed = ("MYSQL_HOST", "MYSQL_USER", "MYSQL_DATABASE")
    if all(os.getenv(k) for k in needed):
        return
    env_path = os.path.join(os.getcwd(), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or os.getenv(key) is not None:
                continue
            value = value.strip().strip('"').strip("'")
            os.environ[key] = value


def _escape_sql_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _parse_cell(value: str) -> Any:
    if value == "NULL":
        return None
    if value == "":
        return None
    # Keep IDs/ZIPs as strings; parse obvious numerics.
    if value.isdigit():
        return int(value)
    try:
        return float(value)
    except ValueError:
        return value


def _is_ignorable_mysql_warning(stderr_text: str) -> bool:
    trimmed = stderr_text.strip()
    if not trimmed:
        return True
    lines = [line.strip() for line in trimmed.splitlines() if line.strip()]
    return bool(lines) and all(line.startswith("mysql: [Warning]") for line in lines)


def _fetch_active_listings(city: str | None, candidate_limit: int) -> list[dict[str, Any]]:
    _load_env_from_dotenv_if_needed()

    host = os.getenv("MYSQL_HOST") or os.getenv("DB_HOST") or "localhost"
    user = os.getenv("MYSQL_USER") or os.getenv("DB_USER") or ""
    password = os.getenv("MYSQL_PASSWORD") or os.getenv("DB_PASSWORD") or ""
    database = os.getenv("MYSQL_DATABASE") or os.getenv("DB_NAME") or ""
    mysql_bin = os.getenv("MYSQL_BIN") or "mysql"

    sql = """
    SELECT
      L_ListingID,
      L_DisplayId,
      L_Address,
      L_City,
      L_Zip,
      L_SystemPrice,
      L_Keyword2,
      LM_Dec_3,
      LM_Int2_3,
      L_Type_,
      YearBuilt,
      DaysOnMarket,
      PhotoCount,
      PoolPrivateYN,
      ViewYN,
      FireplaceYN,
      REPLACE(REPLACE(L_Remarks, '\n', ' '), '\t', ' ') AS L_Remarks
    FROM rets_property
    WHERE (StandardStatus = 'Active' OR L_Status = 'Active')
      AND L_Remarks IS NOT NULL
      AND L_Remarks <> ''
    """

    if city:
        sql += f" AND L_City = '{_escape_sql_literal(city)}'\n"

    sql += f" ORDER BY ModificationTimestamp DESC LIMIT {int(candidate_limit)}"

    args = ["--batch", "--raw", f"--host={host}"]
    if user:
        args.append(f"--user={user}")
    if password:
        args.append(f"--password={password}")
    if database:
        args.append(database)
    args.extend(["-e", sql])

    completed = subprocess.run(
        [mysql_bin, *args],
        env=os.environ,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        err = completed.stderr.strip() or completed.stdout.strip() or "mysql command failed"
        raise RuntimeError(err)
    if completed.stderr and not _is_ignorable_mysql_warning(completed.stderr):
        raise RuntimeError(completed.stderr.strip())

    lines = [line.rstrip("\n") for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        return []
    headers = lines[0].split("\t")
    rows: list[dict[str, Any]] = []
    for line in lines[1:]:
        cells = line.split("\t")
        row: dict[str, Any] = {}
        for idx, header in enumerate(headers):
            row[header] = _parse_cell(cells[idx] if idx < len(cells) else "")
        rows.append(row)
    return rows


def _normalize_scalar(value: Any) -> Any:
    if value == "":
        return None
    return value


def semantic_search(
    query: str,
    city: str | None = None,
    top_k: int = 5,
    candidate_limit: int = 250,
) -> dict[str, Any]:
    rows = _fetch_active_listings(city=city, candidate_limit=max(candidate_limit, top_k))
    if not rows:
        return {
            "query": query,
            "city": city,
            "top_k": top_k,
            "candidate_count": 0,
            "results": [],
        }

    listing_embeddings: list[tuple[str, list[float]]] = []
    row_by_listing_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        listing_id = str(row.get("L_ListingID", "")).strip()
        if not listing_id:
            continue
        listing_embeddings.append((listing_id, build_listing_embedding(row)))
        row_by_listing_id[listing_id] = row

    ranked = rank_listing_embeddings(query, listing_embeddings)[:top_k]
    results: list[dict[str, Any]] = []
    for listing_id, similarity_score in ranked:
        row = row_by_listing_id.get(listing_id)
        if not row:
            continue
        results.append(
            {
                "listing_id": listing_id,
                "display_id": _normalize_scalar(row.get("L_DisplayId")),
                "address": _normalize_scalar(row.get("L_Address")),
                "city": _normalize_scalar(row.get("L_City")),
                "zip": _normalize_scalar(row.get("L_Zip")),
                "price": _normalize_scalar(row.get("L_SystemPrice")),
                "beds": _normalize_scalar(row.get("L_Keyword2")),
                "baths": _normalize_scalar(row.get("LM_Dec_3")),
                "sqft": _normalize_scalar(row.get("LM_Int2_3")),
                "type": _normalize_scalar(row.get("L_Type_")),
                "year_built": _normalize_scalar(row.get("YearBuilt")),
                "days_on_market": _normalize_scalar(row.get("DaysOnMarket")),
                "photo_count": _normalize_scalar(row.get("PhotoCount")),
                "pool": _normalize_scalar(row.get("PoolPrivateYN")),
                "has_view": _normalize_scalar(row.get("ViewYN")),
                "fireplace": _normalize_scalar(row.get("FireplaceYN")),
                "remarks": _normalize_scalar(row.get("L_Remarks")),
                "similarity_score": round(float(similarity_score), 6),
            }
        )

    return {
        "query": query,
        "city": city,
        "top_k": top_k,
        "candidate_count": len(listing_embeddings),
        "results": results,
    }


def _parse_args():
    parser = argparse.ArgumentParser(description="Semantic search over active rets_property listings.")
    parser.add_argument("--query", required=True, type=str)
    parser.add_argument("--city", required=False, type=str, default=None)
    parser.add_argument("--top-k", required=False, type=int, default=5)
    parser.add_argument("--candidate-limit", required=False, type=int, default=250)
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    try:
        payload = semantic_search(
            query=args.query,
            city=args.city,
            top_k=max(1, args.top_k),
            candidate_limit=max(10, args.candidate_limit),
        )
        print(json.dumps(payload))
    except Exception as exc:
        print(f"SEMANTIC_SEARCH_PY_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
