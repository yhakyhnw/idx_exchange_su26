import os

from openai import OpenAI


_client: OpenAI | None = None


def _load_env_from_dotenv_if_needed() -> None:
    if os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_ADMIN_KEY"):
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


def _get_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    _load_env_from_dotenv_if_needed()
    _client = OpenAI()
    return _client


def get_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    text = text.replace("\n", " ").strip()[:8000]  # max token safety
    response = _get_client().embeddings.create(model=model, input=text)
    return response.data[0].embedding


def _safe_text(value: object, fallback: str = "Unknown") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def _safe_price(value: object) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, (int, float)):
        return f"${value:,.0f}"
    try:
        parsed = float(str(value))
        return f"${parsed:,.0f}"
    except (TypeError, ValueError):
        return "N/A"


def build_listing_embedding(row: dict) -> list[float]:
    """Build embedding for a listing by combining key listing fields."""
    property_type = _safe_text(row.get("L_Type_"))
    city = _safe_text(row.get("L_City"))
    beds = _safe_text(row.get("L_Keyword2"), fallback="-")
    baths = _safe_text(row.get("LM_Dec_3"), fallback="-")
    sqft = _safe_text(row.get("LM_Int2_3"), fallback="-")
    year_built = _safe_text(row.get("YearBuilt"), fallback="-")
    price = _safe_price(row.get("L_SystemPrice"))
    remarks = _safe_text(row.get("L_Remarks"), fallback="")

    text = f"""
{property_type} in {city}, CA.
{beds} beds, {baths} baths.
{sqft} sq ft. Built {year_built}.
Price: {price}.
{remarks}
""".strip()
    return get_embedding(text)
