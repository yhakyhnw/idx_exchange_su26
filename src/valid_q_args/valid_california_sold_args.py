import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import mysql.connector


def load_env_file() -> None:
    root_env = Path(__file__).resolve().parents[2] / ".env"
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


def to_json_value(value):
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return value


def fetch_distinct(cursor, table_name: str, column_name: str):
    cursor.execute(
        f"""
        SELECT DISTINCT {column_name}
        FROM {table_name}
        WHERE {column_name} IS NOT NULL
          AND TRIM(CAST({column_name} AS CHAR)) <> ''
        ORDER BY {column_name} ASC
        """
    )
    return [to_json_value(row[0]) for row in cursor.fetchall()]


def fetch_min_max(cursor, table_name: str, column_name: str):
    cursor.execute(
        f"""
        SELECT MIN({column_name}) AS min_value, MAX({column_name}) AS max_value
        FROM {table_name}
        WHERE {column_name} IS NOT NULL
        """
    )
    row = cursor.fetchone()
    return {
        "min": to_json_value(row[0]) if row else None,
        "max": to_json_value(row[1]) if row else None,
    }


def main():
    load_env_file()

    conn = mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST"),
        user=os.environ.get("MYSQL_USER"),
        password=os.environ.get("MYSQL_PASSWORD"),
        database=os.environ.get("MYSQL_DATABASE"),
    )
    cursor = conn.cursor()

    try:
        table_name = "california_sold"
        output = {
            "City": fetch_distinct(cursor, table_name, "City"),
            "CloseDate": fetch_min_max(cursor, table_name, "CloseDate"),
            "ClosePrice": fetch_min_max(cursor, table_name, "ClosePrice"),
            "BedroomsTotal": fetch_min_max(cursor, table_name, "BedroomsTotal"),
            "BathroomsTotalInteger": fetch_min_max(cursor, table_name, "BathroomsTotalInteger"),
            "LivingArea": fetch_min_max(cursor, table_name, "LivingArea"),
            "YearBuilt": fetch_min_max(cursor, table_name, "YearBuilt"),
        }
    finally:
        cursor.close()
        conn.close()

    output_path = Path(__file__).resolve().with_name("valid_california_sold_args.json")
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
