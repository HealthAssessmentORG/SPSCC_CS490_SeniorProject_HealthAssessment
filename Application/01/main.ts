import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { renderExampleUi, type ExampleUiModel } from "./backend/ui.js";

async function run(): Promise<void> {
	// Edit this if the Python script moves to a different location.
	const scriptPath = resolve(process.cwd(), "Application", "01", "random_rows.py");

	// Edit this if your Python executable differs.
	const pythonCommand = resolve(process.cwd(), ".venv", "Scripts", "python.exe");

    const runRandomRows = async (
		seed: number | null,
		assessmentCount: number,
		mode: "full" | "faker" | "sql" = "full"
	): Promise<{ status: string; generatedResponses?: Array<{ assessment_number: number; field_id: number; field_name: string; response: string }> }> => {
		return new Promise((resolveResult, rejectResult) => {
			const env: NodeJS.ProcessEnv = {
				...process.env,
				RANDOM_ROWS_ASSESSMENTS: String(assessmentCount),
			};
			if (seed !== null) {
				env["RANDOM_ROWS_SEED"] = String(seed);
			}

			const child = spawn(pythonCommand, [scriptPath, "--mode", mode], {
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "inherit"],
				env,
			});

			let stdout = "";
			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			child.on("error", (error: unknown) => {
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

				rejectResult(new Error(`random_rows.py exited with code ${String(code)}`));
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
			"View Assessment",
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
