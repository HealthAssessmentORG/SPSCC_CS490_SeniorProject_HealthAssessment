import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { execSql, type DbPool } from "./db_connect.js";
import { loadApplication2Spec, type Application2SpecField, type Application2SpecLayout } from "./read_json.js";

export type Application2ExportOptions = {
	out?: string;
	specPath?: string;
	json?: boolean;
};

export type Application2ExportResult = {
	out_path: string;
	record_count: number;
	export_file_id: string;
	validation_error_count: number;
};

export type Application2ExportProgressHandler = (progress: {
	current: number;
	total: number;
}) => Promise<void> | void;

export type Application2ExportWorkflowOptions = {
	onRecordWritten?: Application2ExportProgressHandler;
};

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

function selectOutPath(options: Application2ExportOptions): string {
	return path.resolve(process.cwd(), options.out ?? path.join("out", "output.txt"));
}

export async function runApplication2ExportWorkflow(
	pool: DbPool,
	options: Application2ExportOptions,
	workflowOptions: Application2ExportWorkflowOptions = {}
): Promise<Application2ExportResult> {
	const layout = loadApplication2Spec(options.specPath);
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

	const outPath = selectOutPath(options);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });

	const lines: string[] = [];
	const total = assessments.length;

	for (let assessmentIndex = 0; assessmentIndex < assessments.length; assessmentIndex++) {
		const assessment = assessments[assessmentIndex]!;
		const row = buildEmptyRow(layout);

		for (const field of layout.fields) {
			setFieldValue(row, field, getAssessmentFieldValue(assessment, field.fieldName));
		}

		lines.push(row.join(""));

		if (workflowOptions.onRecordWritten) {
			await workflowOptions.onRecordWritten({ current: assessmentIndex + 1, total });
		}
	}

	fs.writeFileSync(outPath, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf8");

	return {
		out_path: outPath,
		record_count: assessments.length,
		export_file_id: crypto.randomUUID(),
		validation_error_count: 0
	};
}