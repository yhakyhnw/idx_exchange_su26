import argparse
import os
import sys

import mysql.connector  # noqa: F401  # required by mysql+mysqlconnector dialect
import pandas as pd
from sqlalchemy import create_engine


def _build_engine():
    user = os.getenv("MYSQL_USER") or os.getenv("DB_USER") or "idx_user"
    password = os.getenv("MYSQL_PASSWORD") or os.getenv("DB_PASSWORD") or "password"
    host = os.getenv("MYSQL_HOST") or os.getenv("DB_HOST") or "localhost"
    database = os.getenv("MYSQL_DATABASE") or os.getenv("DB_NAME") or "idx_exchange"
    return create_engine(f"mysql+mysqlconnector://{user}:{password}@{host}/{database}")


def get_price_trend(
    city: str,
    months: int = 24,
    property_type: str = "Residential",
    exclude_leases: bool = True,
    trend_granularity: str = "monthly",
) -> pd.DataFrame:
    date_format = "%Y" if trend_granularity == "yearly" else "%Y-%m"
    query = f"""
    SELECT
    DATE_FORMAT(CloseDate, "{date_format}") AS month,
    COUNT(*) AS sales,
    ROUND(AVG(ClosePrice), 0) AS avg_price,
    ROUND(AVG(DaysOnMarket), 1) AS avg_dom
    FROM california_sold
    WHERE City = %s
    AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
    """
    params = [city, months]

    if property_type:
        query += 'AND PropertyType = %s\n'
        params.append(property_type)
    if exclude_leases:
        query += 'AND PropertyType <> "ResidentialLease"\n'

    query += f"""
    GROUP BY DATE_FORMAT(CloseDate, "{date_format}")
    ORDER BY month
    """
    df = pd.read_sql(query, _build_engine(), params=params)
    df["price_change_pct"] = df["avg_price"].pct_change() * 100
    return df


def _parse_args():
    parser = argparse.ArgumentParser(description="Fetch market price trend rows as JSON.")
    parser.add_argument("--city", required=True, type=str)
    parser.add_argument("--months", required=False, type=int, default=24)
    parser.add_argument("--property-type", required=False, type=str, default="Residential")
    parser.add_argument("--exclude-leases", required=False, type=str, default="true")
    parser.add_argument("--trend-granularity", required=False, choices=["monthly", "yearly"], default="monthly")
    return parser.parse_args()


def _to_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y"}


if __name__ == "__main__":
    args = _parse_args()
    try:
        df = get_price_trend(
            city=args.city,
            months=args.months,
            property_type=args.property_type,
            exclude_leases=_to_bool(args.exclude_leases),
            trend_granularity=args.trend_granularity,
        )
        print(df.to_json(orient="records"))
    except Exception as exc:
        print(f"MARKET_TREND_PY_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
