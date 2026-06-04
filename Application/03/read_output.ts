import fs from "node:fs";
import path from "node:path";

import { execSql, getApplication2Pool, type DbPool } from "../02/src/db_connect.js";
import { loadApplication2Spec, type Application2SpecField, type Application2SpecLayout } from "../02/src/read_json.js";

type AssessmentRow = {
	assessment_id: number;
	form_type_observed: string | null;
	form_version_observed: string | null;
	event_date: string | null;
	dod_id: string | null;
};

type ResponseRow = {
	assessment_id: number;
	response_field_name: string | null;
	response_field_code: string | null;
	response: string | null;
	value_norm: string | null;
};

type AssessmentRecord = AssessmentRow & {
	responses: Map<string, string>;
};

export type Application3VerificationIssue = {
	rowNumber: number;
	kind: "row_count" | "row_length" | "field";
	message: string;
	fieldName?: string;
	expected?: string;
	actual?: string;
};

export type Application3VerificationResult = {
	ok: boolean;
	outPath: string;
	specPath: string;
	rowCount: number;
	expectedRowCount: number;
	matchedRows: number;
	issueCount: number;
	issues: Application3VerificationIssue[];
	reportPath?: string;
};

export type Application3VerificationOptions = {
	outPath?: string;
	specPath?: string;
	reportPath?: string;
	pool?: DbPool;
};

const DEFAULT_OUT_PATH = path.join("out", "output.txt");
const DEFAULT_SPEC_PATH = path.join("Application", "02", "spec.json");
const DEFAULT_REPORT_PATH = path.join("out", "milestones", "demo", "app3_ui_report.txt");

function resolvePathOrDefault(candidate: string | undefined, fallback: string): string {
	if (!candidate || candidate.trim() === "") {
		return path.resolve(process.cwd(), fallback);
	}

	return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function normalizeKey(value: string | null | undefined): string {
	return String(value ?? "").trim().toUpperCase();
}

function stringifyValue(value: unknown): string {
	if (value == null) return "";
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10).replace(/-/g, "");

	const text = String(value).trim();
	if (!text) return "";

	if (/^\d{8}$/.test(text)) return text;

	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime()) && /[-/T]/.test(text)) {
		return parsed.toISOString().slice(0, 10).replace(/-/g, "");
	}

	return text;
}

function normalizeFieldValue(fieldName: string, rawValue: unknown): string {
	const value = stringifyValue(rawValue);
	if (!value) return "";

	const upperName = fieldName.toUpperCase();
	if (
		upperName === "D_EVENT" ||
		upperName === "DOB" ||
		upperName === "D_DEPLOY" ||
		upperName === "D_RET_PREV" ||
		upperName.endsWith("_DATE") ||
		upperName.includes("DATE") ||
		upperName === "LAST_RETURNED_PROVIDER"
	) {
		if (/^\d{8}$/.test(value)) return value;
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toISOString().slice(0, 10).replace(/-/g, "");
		}
	}

	return value;
}

function padFixedWidth(value: string, length: number): string {
	const sliced = value.slice(0, length);
	return sliced + " ".repeat(Math.max(0, length - sliced.length));
}

function setFieldValue(row: string[], specField: Application2SpecField, value: string) {
	const padded = padFixedWidth(value, specField.length);
	for (let index = 0; index < specField.length; index++) {
		row[specField.startPos - 1 + index] = padded[index] ?? " ";
	}
}

function buildEmptyRow(layout: Application2SpecLayout): string[] {
	return Array.from({ length: layout.rowLength }, () => " ");
}

function getAssessmentFieldValue(assessment: AssessmentRecord, fieldName: string): string {
	switch (fieldName) {
		case "FORM_TYPE":
			return normalizeFieldValue(fieldName, assessment.form_type_observed);
		case "FORM_VERSION":
			return normalizeFieldValue(fieldName, assessment.form_version_observed);
		case "DODID":
			return normalizeFieldValue(fieldName, assessment.dod_id);
		case "D_EVENT":
			return normalizeFieldValue(fieldName, assessment.event_date);
		default: {
			const responseValue = assessment.responses.get(normalizeKey(fieldName));
			return normalizeFieldValue(fieldName, responseValue ?? "");
		}
	}
}

async function loadAssessments(pool: DbPool): Promise<AssessmentRecord[]> {
	const result = await execSql(
		pool,
		`
			SELECT
				a.assessment_id,
				a.form_type_observed,
				a.form_version_observed,
				CONVERT(char(8), a.event_date, 112) AS event_date,
				d.dod_id
			FROM dbo.ASSESSMENT AS a
			LEFT JOIN dbo.DEPLOYER AS d ON d.deployer_id = a.deployer_id
			ORDER BY a.assessment_id
		`
	);

	return (result.recordset as AssessmentRow[]).map((row) => ({
		...row,
		responses: new Map<string, string>()
	}));
}

async function loadResponses(pool: DbPool): Promise<ResponseRow[]> {
	const result = await execSql(
		pool,
		`
			SELECT
				r.assessment_id,
				f.field_name AS response_field_name,
				f.field_code AS response_field_code,
				r.response,
				r.value_norm
			FROM dbo.RESPONSE AS r
			INNER JOIN dbo.FIELD AS f ON f.field_id = r.field_id
			ORDER BY r.assessment_id, r.deployer_response_id
		`
	);

	return result.recordset as ResponseRow[];
}

function buildExpectedRows(layout: Application2SpecLayout, assessments: AssessmentRecord[]): string[] {
	return assessments.map((assessment) => {
		const row = buildEmptyRow(layout);
		for (const field of layout.fields) {
			setFieldValue(row, field, getAssessmentFieldValue(assessment, field.fieldName));
		}
		return row.join("");
	});
}

function parseOutputRows(filePath: string): string[] {
	const raw = fs.readFileSync(filePath, "utf8");
	const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}

	return lines;
}

function compareRows(
	layout: Application2SpecLayout,
	expectedRows: string[],
	actualRows: string[]
): { issues: Application3VerificationIssue[]; matchedRows: number } {
	const issues: Application3VerificationIssue[] = [];
	const comparedRowCount = Math.min(expectedRows.length, actualRows.length);
	let matchedRows = 0;

	if (actualRows.length !== expectedRows.length) {
		issues.push({
			rowNumber: 0,
			kind: "row_count",
			message: `Row count mismatch: expected ${expectedRows.length}, found ${actualRows.length}`
		});
	}

	for (let rowIndex = 0; rowIndex < comparedRowCount; rowIndex += 1) {
		const expectedRow = expectedRows[rowIndex] ?? "";
		const actualRow = actualRows[rowIndex] ?? "";
		let rowMatches = actualRow.length === layout.rowLength;

		if (actualRow.length !== layout.rowLength) {
			issues.push({
				rowNumber: rowIndex + 1,
				kind: "row_length",
				message: `Row ${rowIndex + 1} length mismatch: expected ${layout.rowLength}, found ${actualRow.length}`
			});
			rowMatches = false;
		}

		for (const field of layout.fields) {
			const expected = expectedRow.slice(field.startPos - 1, field.endPos);
			const actual = actualRow.slice(field.startPos - 1, field.endPos);
			if (expected !== actual) {
				issues.push({
					rowNumber: rowIndex + 1,
					kind: "field",
					fieldName: field.fieldName,
					message: `Row ${rowIndex + 1} field ${field.fieldName} does not match`,
					expected: expected.trimEnd(),
					actual: actual.trimEnd()
				});
				rowMatches = false;
			}
		}

		if (rowMatches) {
			matchedRows += 1;
		}
	}

	return { issues, matchedRows };
}

function formatIssue(issue: Application3VerificationIssue): string {
	if (issue.kind === "field") {
		return `${issue.message}. Expected ${JSON.stringify(issue.expected ?? "")}, found ${JSON.stringify(issue.actual ?? "")}`;
	}

	return issue.message;
}

export function renderApplication3VerificationReport(result: Application3VerificationResult): string {
	const lines = [
		`Application 3 output verification`,
		`Status: ${result.ok ? "PASS" : "FAIL"}`,
		`Output file: ${result.outPath}`,
		`Spec file: ${result.specPath}`,
		`Rows: ${result.rowCount}/${result.expectedRowCount}`,
		`Matched rows: ${result.matchedRows}`,
		`Issues: ${result.issueCount}`,
		``
	];

	if (result.issues.length === 0) {
		lines.push("No differences found.");
	} else {
		for (const issue of result.issues) {
			lines.push(formatIssue(issue));
		}
	}

	return lines.join("\n") + "\n";
}

export async function verifyApplication3OutputFile(
	options: Application3VerificationOptions = {}
): Promise<Application3VerificationResult> {
	const outPath = resolvePathOrDefault(options.outPath, DEFAULT_OUT_PATH);
	const specPath = resolvePathOrDefault(options.specPath, DEFAULT_SPEC_PATH);
	const layout = loadApplication2Spec(specPath);
	const pool = options.pool ?? (await getApplication2Pool());
	const assessments = await loadAssessments(pool);
	const responses = await loadResponses(pool);

	const assessmentById = new Map<number, AssessmentRecord>();
	for (const assessment of assessments) {
		assessmentById.set(assessment.assessment_id, assessment);
	}

	for (const response of responses) {
		const assessment = assessmentById.get(response.assessment_id);
		if (!assessment) continue;

		const value = normalizeFieldValue(
			response.response_field_name ?? response.response_field_code ?? "",
			response.value_norm ?? response.response ?? ""
		);

		if (response.response_field_name) {
			assessment.responses.set(normalizeKey(response.response_field_name), value);
		}
		if (response.response_field_code) {
			assessment.responses.set(normalizeKey(response.response_field_code), value);
		}
	}

	const expectedRows = buildExpectedRows(layout, assessments);
	const actualRows = parseOutputRows(outPath);
	const comparison = compareRows(layout, expectedRows, actualRows);

	return {
		ok: comparison.issues.length === 0,
		outPath,
		specPath,
		rowCount: actualRows.length,
		expectedRowCount: expectedRows.length,
		matchedRows: comparison.matchedRows,
		issueCount: comparison.issues.length,
		issues: comparison.issues
	};
}

export async function writeApplication3VerificationReport(
	options: Application3VerificationOptions = {}
): Promise<Application3VerificationResult> {
	const reportPath = resolvePathOrDefault(options.reportPath, DEFAULT_REPORT_PATH);
	const result = await verifyApplication3OutputFile({ ...options, reportPath });

	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, renderApplication3VerificationReport(result), "utf8");

	return {
		...result,
		reportPath
	};
}