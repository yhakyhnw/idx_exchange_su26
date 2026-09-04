import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None

# OpenClaw runtime can use a different Python path than user shell.
for extra_site in [
    "/opt/anaconda3/lib/python3.14/site-packages",
    "/opt/anaconda3/lib/python3.13/site-packages",
]:
    if extra_site not in sys.path and Path(extra_site).exists():
        sys.path.append(extra_site)

if OpenAI is None:
    try:
        from openai import OpenAI as _OpenAI
        OpenAI = _OpenAI
    except ModuleNotFoundError:
        OpenAI = None

try:
    from pypdf import PdfReader
except ModuleNotFoundError:
    try:
        from PyPDF2 import PdfReader
    except ModuleNotFoundError:
        PdfReader = None


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


def cosine_similarity_1d(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    a_vec = np.asarray(a, dtype=float)
    b_vec = np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(a_vec) * np.linalg.norm(b_vec))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a_vec, b_vec) / denom)


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def index_documents(docs: list[dict]) -> list[dict]:
    indexed = []
    for doc in docs:
        for chunk in chunk_text(str(doc["content"])):
            indexed.append(
                {
                    "source": doc["title"],
                    "chunk": chunk,
                    "embedding": get_embedding(chunk),
                }
            )
    return indexed


def cache_path() -> Path:
    return Path(__file__).resolve().parents[1] / "knowledge" / "rag_index.json"


def save_index(index: list[dict]) -> None:
    path = cache_path()
    path.write_text(json.dumps(index), encoding="utf-8")


def load_index() -> list[dict]:
    path = cache_path()
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []
    return json.loads(raw)


def retrieve(query: str, index: list[dict], top_k: int = 4) -> list[dict]:
    q_emb = get_embedding(query)
    scored = []
    for doc in index:
        similarity = cosine_similarity_1d(q_emb, doc["embedding"])
        scored.append((doc, similarity))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [doc for doc, _ in scored[:top_k]]


def rag_answer(query: str, index: list[dict], top_k: int = 4) -> dict:
    chunks = retrieve(query, index, top_k=top_k)
    context = "\n\n".join(c["chunk"] for c in chunks)
    prompt = (
        "Answer using only the context below. "
        "If the context does not contain the answer, say you do not have enough source context.\n\n"
        f"{context}\n\nQuestion: {query}"
    )
    if OpenAI is None:
        raise RuntimeError("OpenAI package not installed")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    answer = resp.choices[0].message.content or ""
    return {
        "answer": answer.strip(),
        "sources": list(dict.fromkeys([str(c["source"]) for c in chunks])),
    }


def load_pdf_documents() -> list[dict]:
    knowledge_dir = Path(__file__).resolve().parents[1] / "knowledge"
    if not knowledge_dir.exists():
        return []

    pdf_paths = sorted(knowledge_dir.glob("*.pdf"))
    if not pdf_paths:
        return []
    if PdfReader is None:
        raise RuntimeError("PDF reader not installed")

    docs = []
    for pdf_path in pdf_paths:
        reader = PdfReader(str(pdf_path))
        text_parts = []
        for page in reader.pages:
            text_parts.append(page.extract_text() or "")
        content = "\n".join(text_parts).strip()
        if content:
            docs.append(
                {
                    "title": pdf_path.name,
                    "content": content,
                }
            )
    return docs


def build_documents() -> list[dict]:
    engine = build_engine()
    table_sql = """
    SELECT TABLE_NAME, COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name IN ('rets_property', 'california_sold')
    ORDER BY TABLE_NAME, ORDINAL_POSITION
    """
    table_df = pd.read_sql(table_sql, engine)
    rets_cols = table_df.loc[table_df["TABLE_NAME"] == "rets_property", "COLUMN_NAME"].tolist()
    sold_cols = table_df.loc[table_df["TABLE_NAME"] == "california_sold", "COLUMN_NAME"].tolist()

    docs = [
        {
            "title": "MLS Field Definitions - rets_property columns",
            "content": "rets_property columns: " + ", ".join(rets_cols),
        },
        {
            "title": "MLS Field Definitions - california_sold columns",
            "content": "california_sold columns: " + ", ".join(sold_cols),
        },
    ]
    docs.extend(load_pdf_documents())
    return docs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=4)
    parser.add_argument("--build-index", action="store_true")
    args = parser.parse_args()

    if args.build_index:
        docs = build_documents()
        index = index_documents(docs)
        save_index(index)
        print(json.dumps({"status": "ok", "indexed_chunks": len(index)}))
        return

    index = load_index()
    if not index:
        print(
            json.dumps(
                {
                    "answer": "RAG index not built yet. Run: python3 ./src/ragKnowledge.py --query \"index build\" --build-index",
                    "sources": [],
                }
            )
        )
        return

    answer_payload = rag_answer(args.query, index, top_k=args.top_k)
    print(json.dumps(answer_payload, default=str))


if __name__ == "__main__":
    main()
