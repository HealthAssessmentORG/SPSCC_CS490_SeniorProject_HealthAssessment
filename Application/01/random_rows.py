from __future__ import annotations

import argparse
import json
import os
import random

from faker import Faker
import mssql_python

CONN_STRING = os.getenv("MSSQL_CONN_STRING")
ASSESSMENT_COUNT = int(os.getenv("RANDOM_ROWS_ASSESSMENTS", "1"))
SEED = os.getenv("RANDOM_ROWS_SEED") or None  # None if not set or blank
EDITED_RESPONSES_JSON = os.getenv("RANDOM_ROWS_EDITED_RESPONSES_JSON") or None
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
    if name == "dob":
        return fake.date_of_birth(minimum_age=18, maximum_age=55).strftime("%Y%m%d")
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


def load_edited_responses() -> dict[tuple[int, int], str]:
    if EDITED_RESPONSES_JSON is None:
        return {}

    raw_responses = json.loads(EDITED_RESPONSES_JSON)
    edited_responses: dict[tuple[int, int], str] = {}

    for entry in raw_responses:
        assessment_number = int(entry["assessment_number"])
        field_id = int(entry["field_id"])
        edited_responses[(assessment_number, field_id)] = normalize(str(entry["response"]))

    return edited_responses


def build_generated_responses(
    fake: Faker,
    seed_value: str | None,
    fields: list[tuple[int, str]],
    edited_responses: dict[tuple[int, int], str] | None = None,
) -> list[dict[str, int | str]]:
    generated_responses: list[dict[str, int | str]] = []
    edited_responses = edited_responses or {}

    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        for field_id, field_name in fields:
            response = edited_responses.get(
                (assessment_idx, field_id),
                build_response_value(fake, seed_value, assessment_idx, field_id, field_name),
            )
            generated_responses.append(
                {
                    "assessment_number": assessment_idx,
                    "field_id": field_id,
                    "field_name": field_name,
                    "response": response,
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


def load_existing_dod_ids(cursor) -> set[str]:
    cursor.execute(
        """
        SELECT dod_id
        FROM dbo.DEPLOYER
        ORDER BY dod_id;
        """
    )
    rows = cursor.fetchall()
    return {str(row[0]).strip() for row in rows}


def build_run_insert_sql() -> str:
    return """
        INSERT INTO dbo.[RUN] (run_id, run_name, seed, target_record_count, status)
        OUTPUT INSERTED.run_id
        VALUES (NEWID(), %(run_name)s, %(seed)s, %(target_record_count)s, N'running');
        """


def build_run_insert_params(seed_value: str | None) -> dict[str, int | str | None]:
    return {
        "run_name": "Application 1 random_rows",
        "seed": int(seed_value) if seed_value is not None else None,
        "target_record_count": ASSESSMENT_COUNT,
    }


def create_run(cursor, seed_value: str | None) -> str:
    cursor.execute(build_run_insert_sql(), build_run_insert_params(seed_value))
    row = cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to create run row.")
    return str(row[0])


def update_run_status(cursor, run_id: str, status: str) -> None:
    cursor.execute(
        """
        UPDATE dbo.[RUN]
        SET status = %(status)s,
            finished_at = SYSUTCDATETIME()
        WHERE run_id = %(run_id)s;
        """,
        {
            "run_id": run_id,
            "status": status,
        },
    )


def build_deployer_insert_sql() -> str:
    return """
        INSERT INTO dbo.DEPLOYER (deployer_id, dod_id)
        OUTPUT INSERTED.deployer_id
        VALUES (NEWID(), %(dod_id)s);
        """


def build_deployer_insert_params(dod_id: str) -> dict[str, str]:
    return {"dod_id": dod_id}


def create_deployer(cursor, fake: Faker, used_dod_ids: set[str]) -> str:
    while True:
        dod_id = fake.numerify(text="##########")
        if dod_id in used_dod_ids:
            continue

        cursor.execute(
            build_deployer_insert_sql(),
            build_deployer_insert_params(dod_id),
        )
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Failed to create a deployer row.")

        used_dod_ids.add(dod_id)
        return str(row[0])


def build_assessment_insert_sql() -> str:
    return """
        INSERT INTO dbo.ASSESSMENT (
            run_id,
            deployer_id,
            form_type_observed,
            form_version_observed,
            event_date
        )
        OUTPUT INSERTED.assessment_id
        VALUES (
            %(run_id)s,
            %(deployer_id)s,
            N'PRE',
            N'DD2795_202006',
            CONVERT(date, SYSUTCDATETIME())
        );
        """


def build_assessment_insert_params(run_id: str, deployer_id: str) -> dict[str, str]:
    return {
        "run_id": run_id,
        "deployer_id": deployer_id,
    }


def insert_assessment(cursor, run_id: str, deployer_id: str) -> int:
    cursor.execute(
        build_assessment_insert_sql(),
        build_assessment_insert_params(run_id, deployer_id),
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to create assessment row.")
    return int(row[0])


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


def run_faker_mode(fake: Faker, seed_value: str | None, fields: list[tuple[int, str]], edited_responses: dict[tuple[int, int], str] | None = None) -> None:
    generated_responses = build_generated_responses(fake, seed_value, fields, edited_responses)
    print(json.dumps({"assessment_count": ASSESSMENT_COUNT, "responses": generated_responses}))


def run_sql_mode(connection, cursor, fake: Faker, seed_value: str | None, fields: list[tuple[int, str]], edited_responses: dict[tuple[int, int], str] | None = None) -> None:
    executed_statements = 0
    run_id = create_run(cursor, seed_value)
    used_dod_ids = load_existing_dod_ids(cursor)

    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        deployer_id = create_deployer(cursor, fake, used_dod_ids)
        assessment_id = insert_assessment(cursor, run_id, deployer_id)
        executed_statements += 1

        for field_id, value in build_response_rows(fake, seed_value, assessment_idx, fields):
            value = edited_responses.get((assessment_idx, field_id), value) if edited_responses else value
            cursor.execute(render_response_insert_sql(assessment_id, field_id, value))
            executed_statements += 1

    update_run_status(cursor, run_id, "generated")
    connection.commit()
    print(f"Run ID: {run_id}")
    print(f"Executed {executed_statements} SQL statement(s) for {ASSESSMENT_COUNT} assessment row(s).")


def run_full_mode(connection, cursor, fake: Faker, seed_value: str | None, fields: list[tuple[int, str]], edited_responses: dict[tuple[int, int], str] | None = None) -> None:
    inserted_responses = 0
    run_id = create_run(cursor, seed_value)
    used_dod_ids = load_existing_dod_ids(cursor)
    for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
        deployer_id = create_deployer(cursor, fake, used_dod_ids)
        assessment_id = insert_assessment(cursor, run_id, deployer_id)
        for field_id, value in build_response_rows(fake, seed_value, assessment_idx, fields):
            value = edited_responses.get((assessment_idx, field_id), value) if edited_responses else value
            insert_response(cursor, assessment_id, field_id, value)
            inserted_responses += 1

    update_run_status(cursor, run_id, "generated")
    connection.commit()
    print(f"Run ID: {run_id}")
    print(f"Inserted {ASSESSMENT_COUNT} assessment row(s) and {inserted_responses} response row(s).")


def main() -> None:
    args = build_parser().parse_args()
    if not CONN_STRING:
        raise RuntimeError("MSSQL_CONN_STRING is required. Use npm run ui:app1 or set the shared database connection explicitly.")
    if ASSESSMENT_COUNT < 1:
        raise ValueError("RANDOM_ROWS_ASSESSMENTS must be at least 1")

    fake = Faker()
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

        edited_responses = load_edited_responses()

        if args.mode == "faker":
            run_faker_mode(fake, SEED, fields, edited_responses)
            return

        if args.mode == "sql":
            run_sql_mode(connection, cursor, fake, SEED, fields, edited_responses)
            return

        run_full_mode(connection, cursor, fake, SEED, fields, edited_responses)
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()
