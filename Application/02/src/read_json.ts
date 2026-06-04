import fs from "node:fs";
import path from "node:path";

export type Application2SpecField = {
	fieldName: string;
	length: number;
	startPos: number;
	endPos: number;
};

export type Application2SpecLayout = {
	rowLength: number;
	fields: Application2SpecField[];
};

type RawSpecField = {
	field_name: string;
	LENGTH: number;
	"START POS": number;
	"END POS": number;
};

function resolveSpecPath(specPath?: string): string {
	if (!specPath) {
		return path.resolve(process.cwd(), "Application", "02", "spec.json");
	}

	return path.isAbsolute(specPath) ? specPath : path.resolve(process.cwd(), specPath);
}

function assertPositiveInteger(value: number, label: string): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${label} must be a positive integer`);
	}

	return value;
}

export function loadApplication2Spec(specPath?: string): Application2SpecLayout {
	const raw = fs.readFileSync(resolveSpecPath(specPath), "utf8");
	const parsed = JSON.parse(raw) as RawSpecField[];

	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new Error("Application 2 spec must contain at least one field");
	}

	const fields = parsed
		.map((field, index) => {
			const fieldName = String(field.field_name ?? "").trim();
			if (!fieldName) {
				throw new Error(`Spec field ${index + 1} is missing field_name`);
			}

			const length = assertPositiveInteger(Number(field.LENGTH), `${fieldName}.LENGTH`);
			const startPos = assertPositiveInteger(Number(field["START POS"]), `${fieldName}.START POS`);
			const endPos = assertPositiveInteger(Number(field["END POS"]), `${fieldName}.END POS`);

			if (endPos < startPos) {
				throw new Error(`${fieldName} has END POS before START POS`);
			}

			if (endPos - startPos + 1 !== length) {
				throw new Error(`${fieldName} length does not match start/end positions`);
			}

			return { fieldName, length, startPos, endPos };
		})
		.sort((left, right) => left.startPos - right.startPos);

	let rowLength = 0;
	for (const field of fields) {
		if (field.startPos <= rowLength) {
			throw new Error(`Spec fields overlap at ${field.fieldName}`);
		}
		rowLength = Math.max(rowLength, field.endPos);
	}

	return { rowLength, fields };
}