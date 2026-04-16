from __future__ import annotations

import argparse
import datetime as dt
import os
import random
from typing import Iterable

from faker import Faker
import mssql_python

DEFAULT_CONN_STRING = os.getenv(
	"MSSQL_CONN_STRING",
	"SERVER=24.18.27.110;DATABASE=DD2975_PreDHA;UID=sa;PWD=3939;Encrypt=no;",
)
DEFAULT_SEED = 39
MAX_RESPONSE_LENGTH = 255

YES_NO = ["Yes", "No"]
FREQUENCY = ["Never", "Rarely", "Sometimes", "Often", "Always"]
BOTHERED = ["Not at all", "Several days", "More than half the days", "Nearly every day"]
BRANCHES = ["Army", "Navy", "Air Force", "Marine Corps", "Space Force", "Coast Guard"]
COMPONENTS = ["Active", "Reserve", "Guard"]
PAY_GRADES = ["E04", "E05", "E06", "O02", "W02"]
GENDERS = ["M", "F"]


def build_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Insert synthetic RESPONSE rows into DD2975_PreDHA.")
	parser.add_argument("--conn-string", default=DEFAULT_CONN_STRING, help="SQL Server connection string")
	parser.add_argument("--assessments", type=int, default=1, help="Number of assessment records to create")
	parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Seed for deterministic faker output")
	return parser


def normalize_response(value: str) -> str:
	cleaned = " ".join(str(value).split())
	return cleaned[:MAX_RESPONSE_LENGTH]


def pick(rng: random.Random, options: Iterable[str]) -> str:
	values = list(options)
	if not values:
		raise ValueError("options must not be empty")
	return values[rng.randrange(0, len(values))]


def create_fake_value(fake: Faker, field_code: str, field_name: str, assessment_index: int, seed: int) -> str:
	code = field_code.strip().upper()
	name = field_name.strip().lower()
	rng = random.Random(f"{seed}|{assessment_index}|{code}|{field_name}")

	if "last name" in name:
		return fake.last_name()
	if "first name" in name:
		return fake.first_name()
	if "middle initial" in name:
		return fake.random_uppercase_letter()
	if "point of contact name" in name:
		return fake.name()
	if "assessor title" in name:
		return fake.job()
	if "email" in name:
		return fake.email().lower()
	if "phone number" in name or name.endswith("phone") or "dsn" in name:
		return fake.msisdn()[:10]
	if "mailing address" in name or name.endswith("address"):
		return normalize_response(fake.address())
	if "zip code" in name:
		return fake.postcode()
	if "state" in name:
		return fake.state_abbr()
	if "gender" in name or "sex" in name:
		return pick(rng, GENDERS)
	if "service branch" in name or "branch" in name:
		return pick(rng, BRANCHES)
	if "component" in name:
		return pick(rng, COMPONENTS)
	if "pay grade" in name or "grade" in name:
		return pick(rng, PAY_GRADES)
	if "dod id" in name:
		return fake.numerify(text="##########")
	if "date of birth" in name:
		return fake.date_of_birth(minimum_age=18, maximum_age=55).isoformat()
	if "today's date" in name or "date completed" in name:
		return dt.date.today().isoformat()
	if "estimated date of upcoming deployment" in name:
		return fake.date_between(start_date="+30d", end_date="+365d").isoformat()
	if "date departed" in name or "last returned" in name:
		return fake.date_between(start_date="-5y", end_date="today").isoformat()
	if "country" in name:
		return fake.country()
	if "operation" in name:
		return fake.catch_phrase()
	if "times" in name or "score" in name or "number" in name:
		if "drinks" in name:
			return str(rng.randint(0, 12))
		if "deployments" in name:
			return str(rng.randint(0, 10))
		return str(rng.randint(0, 100))
	if "health during the past month" in name:
		return pick(rng, ["Excellent", "Very good", "Good", "Fair", "Poor"])
	if "smoke tobacco" in name:
		return pick(rng, ["Never", "Less than monthly", "Monthly", "Weekly", "Daily"])
	if "how often do you have a drink" in name or "how often do you have six or more drinks" in name:
		return pick(rng, FREQUENCY)
	if "how many drinks" in name:
		return str(rng.randint(0, 8))
	if "bothered by" in name or "how much have you been bothered" in name:
		return pick(rng, BOTHERED)
	if "referral indicated" in name or name.startswith("did deployer mark") or "yes response" in name:
		return pick(rng, YES_NO)
	if "comments" in name or "significant findings" in name or "medical assessment/disposition" in name:
		return normalize_response(fake.sentence(nb_words=12))
	if "digital signature" in name:
		return fake.name()
	if "certificate" in name:
		return "I certify this review is complete."
	if "list" in name or "concern" in name or "issue" in name or "problem" in name:
		return normalize_response(fake.sentence(nb_words=10))

	if code.startswith("D_10") or code.startswith("D_11") or code.startswith("D_12") or code.startswith("A_11"):
		return pick(rng, BOTHERED if "how much" in name or "bothered" in name else YES_NO)

	return normalize_response(fake.word())


def load_fields(cursor) -> list[tuple[int, str, str]]:
	cursor.execute(
		"""
		SELECT field_id, field_code, field_name
		FROM dbo.FIELD
		ORDER BY field_id;
		"""
	)
	rows = cursor.fetchall()
	return [(int(row[0]), str(row[1]).strip(), str(row[2]).strip()) for row in rows]


def insert_assessment(cursor) -> int:
	cursor.execute(
		"""
		INSERT INTO dbo.ASSESSMENT
		OUTPUT INSERTED.assessment_id AS assessment_id
		DEFAULT VALUES;
		"""
	)
	row = cursor.fetchone()
	if not row:
		raise RuntimeError("Failed to create assessment row")
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
	args = build_parser().parse_args()
	if args.assessments < 1:
		raise ValueError("--assessments must be at least 1")

	fake = Faker()
	Faker.seed(args.seed)
	fake.seed_instance(args.seed)
	random.seed(args.seed)

	connection = mssql_python.connect(args.conn_string)
	cursor = connection.cursor()

	try:
		fields = load_fields(cursor)
		if not fields:
			raise RuntimeError(
				"FIELD table is empty. Run sql_admin/populate_fields.sql before inserting responses."
			)

		total_rows = 0
		for assessment_index in range(1, args.assessments + 1):
			assessment_id = insert_assessment(cursor)
			for field_id, field_code, field_name in fields:
				response = normalize_response(
					create_fake_value(fake, field_code, field_name, assessment_index, args.seed)
				)
				insert_response(cursor, assessment_id, field_id, response)
				total_rows += 1

		connection.commit()
		print(f"Inserted {args.assessments} assessment row(s) and {total_rows} response row(s).")
	except Exception:
		connection.rollback()
		raise
	finally:
		cursor.close()
		connection.close()


if __name__ == "__main__":
	main()