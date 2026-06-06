import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderExampleUi, type ExampleUiModel } from "./backend/ui.js";

function resolvePythonCommand(): string {
	const configuredPython = process.env["APP1_PYTHON"] ?? process.env["PYTHON"];
	if (configuredPython?.trim()) {
		return configuredPython.trim();
	}

	const venvPython = process.platform === "win32"
		? resolve(process.cwd(), ".venv", "Scripts", "python.exe")
		: resolve(process.cwd(), ".venv", "bin", "python");

	if (existsSync(venvPython)) {
		return venvPython;
	}

	return process.platform === "win32" ? "python" : "python3";
}

async function run(): Promise<void> {
	// Edit this if the Python script moves to a different location.
	const scriptPath = resolve(process.cwd(), "Application", "01", "random_rows.py");

	const pythonCommand = resolvePythonCommand();

	const runRandomRows = async (
		seed: number | null,
		assessmentCount: number,
		editedResponses: Array<{ assessment_number: number; field_id: number; field_name: string; response: string }> = [],
		mode: "full" | "faker" | "sql" = "full"
	): Promise<{ status: string; generatedResponses?: Array<{ assessment_number: number; field_id: number; field_name: string; response: string }> }> => {
		return new Promise((resolveResult, rejectResult) => {
			const connString = process.env["MSSQL_CONN_STRING"] ?? "";
			const env: NodeJS.ProcessEnv = {
				...process.env,
				MSSQL_CONN_STRING: connString,
				RANDOM_ROWS_ASSESSMENTS: String(assessmentCount),
			};
			if (seed !== null) {
				env["RANDOM_ROWS_SEED"] = String(seed);
			}
			if (editedResponses.length > 0) {
				env["RANDOM_ROWS_EDITED_RESPONSES_JSON"] = JSON.stringify(editedResponses);
			}

			const child = spawn(pythonCommand, [scriptPath, "--mode", mode], {
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "pipe"],
				env,
			});

			let stdout = "";
			let stderr = "";
			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString("utf8");
			});

			child.on("error", (error: unknown) => {
				if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
					rejectResult(
						new Error(`Failed to start Python command "${pythonCommand}". Set APP1_PYTHON to your Python executable.`)
					);
					return;
				}
				rejectResult(error);
			});

			child.on("close", (code: number | null) => {
				if (code === 0) {
					if (mode === "faker") {
						try {
							const preview = JSON.parse(stdout.trim() || "{}");
							resolveResult({
								status: `Generated ${preview.responses?.length ?? 0} response(s).`,
								generatedResponses: preview.responses ?? [],
							});
							return;
						} catch (error) {
							rejectResult(error);
							return;
						}
					}

					resolveResult({
						status: stdout.trim() || "random_rows.py finished successfully.",
					});
					return;
				}

				const detail = stderr.trim() || stdout.trim();
				rejectResult(
					new Error(
						detail
							? `random_rows.py exited with code ${String(code)}:\n${detail}`
							: `random_rows.py exited with code ${String(code)}`
					)
				);
			});
		});
	};

	const model: ExampleUiModel = {
		status: "Ready",
		// Edit these options to add/remove actions in the menu.
		options: [
			"Edit Seed",
			"Edit Assessment Count",
			"Generate Assessment(s)",
			"View/Edit Assessment",
			"Insert into Database",
			"Generate and Insert",
			"Exit"
		],
		onRunRandomRows: runRandomRows,
	};

	const app = renderExampleUi(model);
	await app.waitUntilExit();
}

run().catch((error) => {
	console.error("Failed to run Ink UI demo:", error);
	process.exitCode = 1;
});
