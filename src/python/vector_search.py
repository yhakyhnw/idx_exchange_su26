import numpy as np

from embeddings import get_embedding


def _cosine_similarity(query_vec: np.ndarray, candidate_vec: np.ndarray) -> float:
    """Cosine similarity implemented with numpy only."""
    denom = float(np.linalg.norm(query_vec) * np.linalg.norm(candidate_vec))
    if denom == 0:
        return 0.0
    return float(np.dot(query_vec, candidate_vec) / denom)


def rank_listing_embeddings(
    query: str,
    listing_embeddings: list[tuple[str, list[float]]],
) -> list[tuple[str, float]]:
    """Return listing IDs ranked by cosine similarity score."""
    query_vec = np.array(get_embedding(query), dtype=float)
    scores: list[tuple[str, float]] = []

    for listing_id, emb in listing_embeddings:
        sim = _cosine_similarity(query_vec, np.array(emb, dtype=float))
        scores.append((listing_id, float(sim)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores


def find_similar_listings(
    query: str,
    listing_embeddings: list[tuple[str, list[float]]],
    top_k: int = 5,
) -> list[str]:
    """Return top_k listing IDs most similar to the query."""
    return [lid for lid, _ in rank_listing_embeddings(query, listing_embeddings)[:top_k]]
