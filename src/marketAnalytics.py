import pandas as pd
import mysql.connector
import argparse
import json
import os
from pathlib import Path
from urllib.parse import quote_plus
from sqlalchemy import create_engine


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


engine = build_engine()


# Monthly price trends for a city
def get_price_trend(city: str, months: int = 24):
    query = """
    SELECT
        DATE_FORMAT(CloseDate, "%Y-%m") AS month,
        COUNT(*) AS sales,
        ROUND(AVG(ClosePrice), 0) AS avg_price,
        ROUND(AVG(DaysOnMarket), 1) AS avg_dom
    FROM california_sold
    WHERE City = %s
      AND PropertyType = "Residential"
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
    GROUP BY DATE_FORMAT(CloseDate, "%Y-%m")
    ORDER BY month
    """
    df = pd.read_sql(query, engine, params=(city, months))
    month_range = pd.date_range(
        end=pd.Timestamp.today().replace(day=1),
        periods=months,
        freq="MS",
    ).strftime("%Y-%m")
    full_months = pd.DataFrame({"month": month_range})
    df = full_months.merge(df, on="month", how="left")
    df["sales"] = df["sales"].fillna(0).astype(int)
    df.loc[df["sales"] == 0, ["avg_price", "avg_dom"]] = None
    df["price_change_pct"] = df["avg_price"].pct_change() * 100
    return df


def get_city_market_snapshot():
    query = """
    SELECT
        City,
        COUNT(*) AS sold_count,
        ROUND(AVG(ClosePrice), 0) AS avg_close_price,
        ROUND(AVG(ClosePrice / NULLIF(LivingArea,0)),0) AS avg_price_per_sqft,
        ROUND(AVG(DaysOnMarket), 1) AS avg_dom,
        ROUND(AVG(ClosePrice / NULLIF(ListPrice,0)) * 100, 1) AS list_to_close_pct
    FROM california_sold
    WHERE PropertyType = 'Residential'
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      AND LivingArea > 0
    GROUP BY City
    ORDER BY sold_count DESC
    LIMIT 25
    """
    return pd.read_sql(query, engine)


def get_avg_median_close_price(
    group_by: str = "City",
    months: int = 12,
    limit: int = 50,
):
    group_by_map = {
        "city": "City",
        "zip": "PostalCode",
        "property_type": "PropertyType",
    }
    group_col = group_by_map.get(group_by.lower(), "City")

    # Use percentile_cont for median (MySQL 8+).
    query = f"""
    SELECT
        {group_col} AS segment,
        COUNT(*) AS sold_count,
        ROUND(AVG(ClosePrice), 0) AS avg_close_price,
        ROUND(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ClosePrice),
            0
        ) AS median_close_price
    FROM california_sold
    WHERE PropertyType = 'Residential'
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
      AND ClosePrice IS NOT NULL
      AND {group_col} IS NOT NULL
      AND TRIM(CAST({group_col} AS CHAR)) <> ''
    GROUP BY {group_col}
    ORDER BY sold_count DESC
    LIMIT %s
    """
    return pd.read_sql(query, engine, params=(months, limit))


def get_price_per_sqft_trend(city: str, months: int = 24):
    query = """
    SELECT
        DATE_FORMAT(CloseDate, "%Y-%m") AS month,
        COUNT(*) AS sales,
        ROUND(AVG(ClosePrice / NULLIF(LivingArea, 0)), 0) AS avg_price_per_sqft
    FROM california_sold
    WHERE City = %s
      AND PropertyType = 'Residential'
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
      AND LivingArea > 0
      AND ClosePrice > 0
    GROUP BY DATE_FORMAT(CloseDate, "%Y-%m")
    ORDER BY month
    """
    df = pd.read_sql(query, engine, params=(city, months))
    df["pps_change_pct"] = df["avg_price_per_sqft"].pct_change() * 100
    return df


def get_list_to_close_ratio_trend(city: str, months: int = 24):
    query = """
    SELECT
        DATE_FORMAT(CloseDate, "%Y-%m") AS month,
        COUNT(*) AS sales,
        ROUND(AVG(ClosePrice / NULLIF(ListPrice, 0)) * 100, 1) AS list_to_close_pct
    FROM california_sold
    WHERE City = %s
      AND PropertyType = 'Residential'
      AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
      AND ListPrice > 0
      AND ClosePrice > 0
    GROUP BY DATE_FORMAT(CloseDate, "%Y-%m")
    ORDER BY month
    """
    df = pd.read_sql(query, engine, params=(city, months))
    df["ratio_change_pct"] = df["list_to_close_pct"].pct_change() * 100
    return df


def get_avg_dom_by_city_month(months: int = 12, limit_cities: int = 30):
    query = """
    WITH top_cities AS (
      SELECT City
      FROM california_sold
      WHERE PropertyType = 'Residential'
        AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        AND City IS NOT NULL
      GROUP BY City
      ORDER BY COUNT(*) DESC
      LIMIT %s
    )
    SELECT
        s.City,
        DATE_FORMAT(s.CloseDate, "%Y-%m") AS month,
        COUNT(*) AS sales,
        ROUND(AVG(s.DaysOnMarket), 1) AS avg_dom
    FROM california_sold s
    INNER JOIN top_cities t ON s.City = t.City
    WHERE s.PropertyType = 'Residential'
      AND s.CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
    GROUP BY s.City, DATE_FORMAT(s.CloseDate, "%Y-%m")
    ORDER BY s.City, month
    """
    return pd.read_sql(query, engine, params=(months, limit_cities, months))


def get_inventory_vs_sales(city: str, months: int = 12):
    query = """
    SELECT
        %s AS city,
        -- Active inventory snapshot
        (
            SELECT COUNT(*)
            FROM rets_property
            WHERE L_Status = 'Active'
              AND L_City = %s
        ) AS active_inventory_count,
        -- Sold volume over trailing period
        (
            SELECT COUNT(*)
            FROM california_sold
            WHERE PropertyType = 'Residential'
              AND City = %s
              AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        ) AS sold_volume_count
    """
    df = pd.read_sql(query, engine, params=(city, city, city, months))
    if not df.empty:
        active_count = df.loc[0, "active_inventory_count"] or 0
        sold_count = df.loc[0, "sold_volume_count"] or 0
        months_supply = (active_count / sold_count * months) if sold_count > 0 else None
        df["months_supply_estimate"] = months_supply
    return df


def get_mom_yoy_comparison(city: str, months: int = 24):
    query = """
    WITH monthly AS (
      SELECT
          DATE_FORMAT(CloseDate, "%Y-%m-01") AS month_start,
          COUNT(*) AS sales,
          AVG(ClosePrice) AS avg_close_price,
          AVG(ClosePrice / NULLIF(LivingArea, 0)) AS avg_price_per_sqft
      FROM california_sold
      WHERE City = %s
        AND PropertyType = 'Residential'
        AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        AND LivingArea > 0
      GROUP BY DATE_FORMAT(CloseDate, "%Y-%m-01")
    )
    SELECT
        month_start,
        sales,
        ROUND(avg_close_price, 0) AS avg_close_price,
        ROUND(avg_price_per_sqft, 0) AS avg_price_per_sqft
    FROM monthly
    ORDER BY month_start
    """
    df = pd.read_sql(query, engine, params=(city, months))
    if df.empty:
        return df

    df["mom_price_pct"] = df["avg_close_price"].pct_change() * 100
    df["mom_ppsf_pct"] = df["avg_price_per_sqft"].pct_change() * 100
    df["yoy_price_pct"] = (df["avg_close_price"] / df["avg_close_price"].shift(12) - 1) * 100
    df["yoy_ppsf_pct"] = (df["avg_price_per_sqft"] / df["avg_price_per_sqft"].shift(12) - 1) * 100
    return df


def _normalize_records(df: pd.DataFrame):
    if df is None:
        return []
    cleaned = df.astype(object).where(pd.notnull(df), None)
    return cleaned.to_dict(orient="records")


def run_action(action: str, city: str | None, months: int, limit: int, group_by: str):
    if action == "price_trend":
        if not city:
            raise ValueError("city is required for price_trend")
        df = get_price_trend(city, months)
    elif action == "city_snapshot":
        df = get_city_market_snapshot()
    elif action == "avg_median":
        df = get_avg_median_close_price(group_by=group_by, months=months, limit=limit)
    elif action == "price_per_sqft_trend":
        if not city:
            raise ValueError("city is required for price_per_sqft_trend")
        df = get_price_per_sqft_trend(city, months)
    elif action == "list_to_close_ratio_trend":
        if not city:
            raise ValueError("city is required for list_to_close_ratio_trend")
        df = get_list_to_close_ratio_trend(city, months)
    elif action == "avg_dom_by_city_month":
        df = get_avg_dom_by_city_month(months=months, limit_cities=limit)
    elif action == "inventory_vs_sales":
        if not city:
            raise ValueError("city is required for inventory_vs_sales")
        df = get_inventory_vs_sales(city, months)
    elif action == "mom_yoy_comparison":
        if not city:
            raise ValueError("city is required for mom_yoy_comparison")
        df = get_mom_yoy_comparison(city, months)
    else:
        raise ValueError(f"unknown action: {action}")

    return {
        "action": action,
        "params": {
            "city": city,
            "months": months,
            "limit": limit,
            "group_by": group_by,
        },
        "records": _normalize_records(df),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action")
    parser.add_argument("--city", default=None)
    parser.add_argument("--months", type=int, default=12)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--group-by", default="city")
    args = parser.parse_args()

    payload = run_action(
        action=args.action,
        city=args.city,
        months=args.months,
        limit=args.limit,
        group_by=args.group_by,
    )
    print(json.dumps(payload, default=str))


if __name__ == "__main__":
    main()
