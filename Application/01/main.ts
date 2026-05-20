import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { renderExampleUi, type ExampleUiModel } from "./backend/ui.js";

async function run(): Promise<void> {
	// Edit this if the Python script moves to a different location.
	const scriptPath = resolve(process.cwd(), "Application", "01", "random_rows.py");

	// Edit this if your Python executable differs.
	const pythonCommand = resolve(process.cwd(), ".venv", "Scripts", "python.exe");

	const runRandomRows = async (seed: number | null, assessmentCount: number): Promise<string> => {
		return new Promise((resolveResult, rejectResult) => {
			const env: NodeJS.ProcessEnv = {
				...process.env,
				RANDOM_ROWS_ASSESSMENTS: String(assessmentCount),
			};
			if (seed !== null) {
				env["RANDOM_ROWS_SEED"] = String(seed);
			}

			const child = spawn(pythonCommand, [scriptPath], {
				cwd: process.cwd(),
				stdio: "inherit",
				env,
			});

			child.on("error", (error: unknown) => {
				rejectResult(error);
			});

			child.on("close", (code: number | null) => {
				if (code === 0) {
					resolveResult("random_rows.py finished successfully.");
					return;
				}

				rejectResult(new Error(`random_rows.py exited with code ${String(code)}`));
			});
		});
	};

	const model: ExampleUiModel = {
		status: "Ready",
		// Edit these options to add/remove actions in the menu.
		options: ["Edit Seed", "Clear Seed", "Edit Assessment Count", "Run random_rows.py", "Exit"],
		onRunRandomRows: runRandomRows,
	};

	const app = renderExampleUi(model);
	await app.waitUntilExit();
}

run().catch((error) => {
	console.error("Failed to run Ink UI demo:", error);
	process.exitCode = 1;
});
