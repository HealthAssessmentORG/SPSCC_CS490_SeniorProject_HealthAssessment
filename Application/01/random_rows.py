from __future__ import annotations

import argparse
import json
import os
import random
import uuid

from faker import Faker
import mssql_python

CONN_STRING = os.getenv(
    "MSSQL_CONN_STRING",
    "SERVER=24.18.27.110;DATABASE=DD2975_PreDHA;UID=sa;PWD=3939;Encrypt=no;",
)
ASSESSMENT_COUNT = int(os.getenv("RANDOM_ROWS_ASSESSMENTS", "1"))
SEED = os.getenv("RANDOM_ROWS_SEED") or None  # None if not set or blank
RUN_ID = os.getenv("RANDOM_ROWS_RUN_ID") or None
RUN_NAME = os.getenv("RANDOM_ROWS_RUN_NAME", "app1_random_rows")
MAX_RESPONSE_LENGTH = 255


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate and insert synthetic RESPONSE rows.")
    parser.add_argument(
        "--mode",
        choices=("full", "faker", "sql"),
        default="full",
        help="Run the full fill, faker-only generation, or SQL statement generation.",
    )
    return parser


def normalize(value: str) -> str:
    return " ".join(str(value).split())[:MAX_RESPONSE_LENGTH]


# Faker data generation -----------------------------------------------------

def make_response(fake: Faker, rng: random.Random, field_name: str) -> str:
    name = field_name.lower()

    if "last name" in name:
        return fake.last_name()
    if "first name" in name:
        return fake.first_name()
    if "middle initial" in name:
        return fake.random_uppercase_letter()
    if "email" in name:
        return fake.email().lower()
    if "phone" in name or "dsn" in name:
        return fake.numerify(text="##########")
    if "date" in name:
        return fake.date_between(start_date="-5y", end_date="today").strftime("%Y%m%d")
    if "gender" in name or "sex" in name:
        return rng.choice(["M", "F", "X"])
    if "service branch" in name:
        return rng.choice(["A", "C", "D", "F", "M", "N", "P", "X"])
    if "component" in name:
        return rng.choice(["A", "N", "R", "X"])
    if "grade" in name:
        return rng.choice(["E04", "E05", "E06", "O02", "W02"])
    if "country" in name:
        return fake.country()
    if "address" in name:
        return normalize(fake.address())
    if "yes" in name or "no" in name or "indicated" in name:
        return rng.choice(["Yes", "No"])

    return normalize(fake.sentence(nb_words=8))


def build_response_value(fake: Faker, seed_value: str | None, assessment_idx: int, field_id: int, field_name: str) -> str:
    if seed_value is not None:
        rng = random.Random(f"{seed_value}|{assessment_idx}|{field_id}")
    else:
        rng = random.Random()

    return normalize(make_response(fake, rng, field_name))


def build_response_rows(fake: Faker, seed_value: str | None, assessment_idx: int, fields: list[tuple[int, str]]) -> list[tuple[int, str]]:
    return [
        (field_id, build_response_value(fake, seed_value, assessment_idx, field_id, field_name))
        for field_id, field_name in fields
    ]


def build_generated_responses(
    fake: Faker,
    seed_value: str | None,
    fields: list[tuple[int, str]],
) -> list[dict[str, int | str]]:
    generated_responses: list[dict[str, int | str]] = []

    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        for field_id, field_name in fields:
            generated_responses.append(
                {
                    "assessment_number": assessment_idx,
                    "field_id": field_id,
                    "field_name": field_name,
                    "response": build_response_value(fake, seed_value, assessment_idx, field_id, field_name),
                }
            )

    return generated_responses


def sql_literal(value: str | int) -> str:
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace("'", "''") + "'"


def load_fields(cursor) -> list[tuple[int, str]]:
    cursor.execute(
        """
        SELECT field_id, field_name
        FROM dbo.FIELD
        ORDER BY field_id;
        """
    )
    rows = cursor.fetchall()
    return [(int(row[0]), str(row[1])) for row in rows]


def database_supports_run_bridge(cursor) -> bool:
    cursor.execute(
        """
        SELECT CASE
            WHEN EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'dbo'
                  AND TABLE_NAME = 'RUN'
            )
            AND EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'dbo'
                  AND TABLE_NAME = 'ASSESSMENT'
                  AND COLUMN_NAME = 'run_id'
            )
            THEN 1 ELSE 0
        END;
        """
    )
    row = cursor.fetchone()
    return bool(row and int(row[0]) == 1)


def build_run_id() -> str:
    if RUN_ID is None:
        return str(uuid.uuid4())
    return str(uuid.UUID(RUN_ID))


def insert_run(cursor, run_id: str, seed_value: int | None, target_record_count: int) -> None:
    cursor.execute(
        """
        INSERT INTO dbo.[RUN] (run_id, run_name, seed, target_record_count, status)
        VALUES (%(run_id)s, %(run_name)s, %(seed)s, %(target_record_count)s, %(status)s);
        """,
        {
            "run_id": run_id,
            "run_name": RUN_NAME,
            "seed": seed_value,
            "target_record_count": target_record_count,
            "status": "generated",
        },
    )


def insert_assessment(cursor, run_id: str | None) -> int:
    if run_id is None:
        cursor.execute(build_assessment_insert_sql())
    else:
        cursor.execute(build_assessment_insert_sql(run_id), {"run_id": run_id})
    row = cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to create assessment row.")
    return int(row[0])


def build_assessment_insert_sql(run_id: str | None = None) -> str:
    if run_id is not None:
        return """
            INSERT INTO dbo.ASSESSMENT (run_id)
            OUTPUT INSERTED.assessment_id
            VALUES (%(run_id)s);
            """

    return """
        INSERT INTO dbo.ASSESSMENT
        OUTPUT INSERTED.assessment_id
        DEFAULT VALUES;
        """


# SQL statement construction ------------------------------------------------

def build_response_insert_sql() -> str:
    return """
        INSERT INTO dbo.RESPONSE (assessment_id, field_id, response)
        VALUES (%(assessment_id)s, %(field_id)s, %(response)s);
        """


def build_response_insert_params(assessment_id: int, field_id: int, response: str) -> dict[str, int | str]:
    return {
        "assessment_id": assessment_id,
        "field_id": field_id,
        "response": response,
    }


def render_response_insert_sql(assessment_id: int, field_id: int, response: str) -> str:
    return (
        "INSERT INTO dbo.RESPONSE (assessment_id, field_id, response) VALUES ("
        f"{sql_literal(assessment_id)}, {sql_literal(field_id)}, {sql_literal(response)});"
    )


def insert_response(cursor, assessment_id: int, field_id: int, response: str) -> None:
    cursor.execute(
        build_response_insert_sql(),
        build_response_insert_params(assessment_id, field_id, response),
    )


def run_faker_mode(fake: Faker, seed_value: str | None, fields: list[tuple[int, str]]) -> None:
    generated_responses = build_generated_responses(fake, seed_value, fields)
    print(json.dumps({"assessment_count": ASSESSMENT_COUNT, "responses": generated_responses}))


def run_sql_mode(
    connection,
    cursor,
    fake: Faker,
    seed_value: str | None,
    fields: list[tuple[int, str]],
    run_id: str | None,
) -> None:
    executed_statements = 0

    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        if run_id is None:
            cursor.execute(build_assessment_insert_sql())
        else:
            cursor.execute(build_assessment_insert_sql(run_id), {"run_id": run_id})
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Failed to create assessment row.")

        assessment_id = int(row[0])
        executed_statements += 1

        for field_id, value in build_response_rows(fake, seed_value, assessment_idx, fields):
            cursor.execute(render_response_insert_sql(assessment_id, field_id, value))
            executed_statements += 1

    connection.commit()
    print(f"Executed {executed_statements} SQL statement(s) for {ASSESSMENT_COUNT} assessment row(s).")
    if run_id is not None:
        print(f"Run ID: {run_id}")


def run_full_mode(
    connection,
    cursor,
    fake: Faker,
    seed_value: str | None,
    fields: list[tuple[int, str]],
    run_id: str | None,
) -> None:
    inserted_responses = 0
    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        assessment_id = insert_assessment(cursor, run_id)
        for field_id, value in build_response_rows(fake, seed_value, assessment_idx, fields):
            insert_response(cursor, assessment_id, field_id, value)
            inserted_responses += 1

    connection.commit()
    print(f"Inserted {ASSESSMENT_COUNT} assessment row(s) and {inserted_responses} response row(s).")
    if run_id is not None:
        print(f"Run ID: {run_id}")


def main() -> None:
    args = build_parser().parse_args()
    if ASSESSMENT_COUNT < 1:
        raise ValueError("RANDOM_ROWS_ASSESSMENTS must be at least 1")

    fake = Faker()
    seed_int: int | None = None
    if SEED is not None:
        seed_int = int(SEED)
        Faker.seed(seed_int)
        fake.seed_instance(seed_int)

    connection = mssql_python.connect(CONN_STRING)
    cursor = connection.cursor()

    try:
        fields = load_fields(cursor)
        if not fields:
            raise RuntimeError("FIELD table is empty. Populate FIELD before running this script.")

        if args.mode == "faker":
            run_faker_mode(fake, SEED, fields)
            return

        run_id = None
        if database_supports_run_bridge(cursor):
            run_id = build_run_id()
            insert_run(cursor, run_id, seed_int, ASSESSMENT_COUNT)

        if args.mode == "sql":
            run_sql_mode(connection, cursor, fake, SEED, fields, run_id)
            return

        run_full_mode(connection, cursor, fake, SEED, fields, run_id)
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()
