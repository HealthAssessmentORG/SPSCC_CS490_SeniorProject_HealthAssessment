import { spawn } from "child_process";
import { resolve } from "path";
import { renderExampleUi, type ExampleUiModel } from "./backend/ui.ts";

// Minimal process typing for this local script-only setup.
declare const process: {
	argv: string[];
	exitCode?: number;
	cwd: () => string;
};

// Edit this function if you want different CLI flags or default title behavior.
function parseTitle(argv: string[]): string {
	const titleIndex = argv.findIndex((arg) => arg === "--title");
	if (titleIndex >= 0 && argv[titleIndex + 1]) {
		return argv[titleIndex + 1];
	}
	// Edit this fallback text to change the default title when --title is not provided.
	return "Dev Tools UI Example";
}

async function run(): Promise<void> {
	const title = parseTitle(process.argv.slice(2));

	// Edit this if the Python script moves to a different location.
	const scriptPath = resolve(process.cwd(), "Application", "01", "random_rows.py");

	// Edit this if your Python executable differs.
	const pythonCommand = resolve(process.cwd(), ".venv", "Scripts", "python.exe");

	const runRandomRows = async (seed: number, assessmentCount: number): Promise<string> => {
		return new Promise((resolveResult, rejectResult) => {
			const child = spawn(pythonCommand, [scriptPath], {
				cwd: process.cwd(),
				stdio: "inherit",
				env: {
					...process.env,
					RANDOM_ROWS_SEED: String(seed),
					RANDOM_ROWS_ASSESSMENTS: String(assessmentCount),
				},
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
		title,
		status: "Ready",
		// Edit these options to add/remove actions in the menu.
		options: ["Edit Seed", "Edit Assessment Count", "Run random_rows.py", "Exit"],
		onRunRandomRows: runRandomRows,
	};

	const app = renderExampleUi(model);
	await app.waitUntilExit();
}

run().catch((error) => {
	console.error("Failed to run Ink UI demo:", error);
	process.exitCode = 1;
});
