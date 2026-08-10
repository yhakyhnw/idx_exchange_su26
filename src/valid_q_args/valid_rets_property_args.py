import json
import os
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
    return value


def fetch_distinct(cursor, column_name: str):
    cursor.execute(
        f"""
        SELECT DISTINCT {column_name}
        FROM rets_property
        WHERE {column_name} IS NOT NULL
          AND TRIM(CAST({column_name} AS CHAR)) <> ''
        ORDER BY {column_name} ASC
        """
    )
    return [to_json_value(row[0]) for row in cursor.fetchall()]


def fetch_min_max(cursor, column_name: str):
    cursor.execute(
        f"""
        SELECT MIN({column_name}) AS min_value, MAX({column_name}) AS max_value
        FROM rets_property
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
        output = {
            "L_City": fetch_distinct(cursor, "L_City"),
            "L_systemPrice": fetch_min_max(cursor, "L_SystemPrice"),
            "L_Keyword2": fetch_min_max(cursor, "L_Keyword2"),
            "LM_Dec_3": fetch_min_max(cursor, "LM_Dec_3"),
            "LM_Int2_3": fetch_min_max(cursor, "LM_Int2_3"),
            "L_Type_": fetch_distinct(cursor, "L_Type_"),
            "PoolPrivateYN": fetch_distinct(cursor, "PoolPrivateYN"),
            "ViewYN": fetch_distinct(cursor, "ViewYN"),
            "AssociationFee": fetch_min_max(cursor, "AssociationFee"),
        }
    finally:
        cursor.close()
        conn.close()

    output_path = Path(__file__).resolve().with_name("valid_rets_property_args.json")
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
