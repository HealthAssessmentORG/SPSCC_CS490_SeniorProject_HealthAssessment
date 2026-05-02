from __future__ import annotations

import os
import random

from faker import Faker
import mssql_python

CONN_STRING = os.getenv(
    "MSSQL_CONN_STRING",
    "SERVER=24.18.27.110;DATABASE=DD2975_PreDHA;UID=sa;PWD=3939;Encrypt=no;",
)
ASSESSMENT_COUNT = int(os.getenv("RANDOM_ROWS_ASSESSMENTS", "1"))
SEED = os.getenv("RANDOM_ROWS_SEED")  # None if not set
MAX_RESPONSE_LENGTH = 255


def normalize(value: str) -> str:
    return " ".join(str(value).split())[:MAX_RESPONSE_LENGTH]


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


def insert_assessment(cursor) -> int:
    cursor.execute(
        """
        INSERT INTO dbo.ASSESSMENT
        OUTPUT INSERTED.assessment_id
        DEFAULT VALUES;
        """
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError("Failed to create assessment row.")
    return int(row[0])


def insert_response(cursor, assessment_id: int, field_id: int, response: str) -> None:
    cursor.execute(
        """
        INSERT INTO dbo.RESPONSE (assessment_id, field_id, response)
        VALUES (%(assessment_id)s, %(field_id)s, %(response)s);
        """,
        {
            "assessment_id": assessment_id,
            "field_id": field_id,
            "response": response,
        },
    )


def main() -> None:
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

        inserted_responses = 0
        for assessment_idx in range(1, ASSESSMENT_COUNT + 1):
            assessment_id = insert_assessment(cursor)
            for field_id, field_name in fields:
                if SEED is not None:
                    rng = random.Random(f"{SEED}|{assessment_idx}|{field_id}")
                else:
                    rng = random.Random()
                value = normalize(make_response(fake, rng, field_name))
                insert_response(cursor, assessment_id, field_id, value)
                inserted_responses += 1

        connection.commit()
        print(
            f"Inserted {ASSESSMENT_COUNT} assessment row(s) and {inserted_responses} response row(s)."
        )
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    main()