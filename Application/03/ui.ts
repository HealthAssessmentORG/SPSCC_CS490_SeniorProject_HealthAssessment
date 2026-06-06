import React from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import sql from "mssql";
import path from "node:path";

import { getApplication2DbConfigFromEnv } from "../02/src/db_connect.js";
import {
	APPLICATION_3_OUTPUT_FILE,
	APPLICATION_3_REPORT_FILE,
	verifyApplication3OutputFile,
	writeApplication3VerificationReport,
	type Application3VerificationResult
} from "./read_output.js";

type ValidationProgress = {
	current: number;
	total: number;
	message: string;
};

type UiPhase = "welcome" | "dashboard";

type DashboardState = {
	status: string;
	loading: boolean;
	error: string | null;
	verification: Application3VerificationResult | null;
	notice: string | null;
	spinnerIndex: number;
	reportPath: string;
};

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

const OUTPUT_FILE_LABEL = `\\${APPLICATION_3_OUTPUT_FILE.split(path.sep).join("\\")}`;
const REPORT_FILE_LABEL = `\\${APPLICATION_3_REPORT_FILE.split(path.sep).join("\\")}`;

function requestExit(exit: () => void) {
	exit();
	process.exit(0);
}

function readConnectionTarget(): string {
	try {
		const config = getApplication2DbConfigFromEnv();
		const server = config.port ? `${config.server},${config.port}` : config.server;

		if (server && config.database) {
			return `${server} / ${config.database}`;
		}
	} catch {
		// Keep the validation screen usable if the environment is incomplete.
	}

	return "Application 3 MSSQL database";
}

function formatShortPath(filePath: string): string {
	const relativePath = path.relative(process.cwd(), filePath);
	return `\\${relativePath.split(path.sep).join("\\")}`;
}

async function validateApplication3Connection(onProgress: (progress: ValidationProgress) => void): Promise<void> {
	const config = getApplication2DbConfigFromEnv();
	onProgress({ current: 1, total: 3, message: `Opening SQL Server connection for ${readConnectionTarget()}` });
	const pool = await new sql.ConnectionPool(config).connect();

	try {
		onProgress({ current: 2, total: 3, message: "Running validation query (SELECT 1)..." });
		const result = await pool.request().query("SELECT 1 AS ok");
		if (!result.recordset || result.recordset.length === 0) {
			throw new Error("Validation query returned no rows.");
		}
	} finally {
		onProgress({ current: 3, total: 3, message: "Closing validation connection..." });
		await pool.close();
	}
}

function ConnectionTestUi(props: { onContinue: () => void }) {
	const { exit } = useApp();
	const [connectionStatus, setConnectionStatus] = React.useState("Preparing validation target...");
	const [connectionError, setConnectionError] = React.useState<string | null>(null);
	const [connectionReady, setConnectionReady] = React.useState(false);
	const [validationAttempt, setValidationAttempt] = React.useState(0);
	const [connectionProgress, setConnectionProgress] = React.useState<ValidationProgress>({
		current: 0,
		total: 3,
		message: "Preparing validation target..."
	});
	const [spinnerIndex, setSpinnerIndex] = React.useState(0);

	React.useEffect(() => {
		let cancelled = false;

		const runValidation = async () => {
			setConnectionReady(false);
			setConnectionError(null);
			setConnectionStatus("Preparing validation target...");
			setConnectionProgress({ current: 0, total: 3, message: "Preparing validation target..." });

			try {
				await validateApplication3Connection((progress: ValidationProgress) => {
					if (!cancelled) {
						setConnectionStatus(progress.message);
						setConnectionProgress(progress);
					}
				});
				if (!cancelled) {
					setConnectionStatus("Connection verified. Press Enter or Space to continue.");
					setConnectionReady(true);
					setConnectionProgress({
						current: 3,
						total: 3,
						message: "Connection verified. Press Enter or Space to continue."
					});
				}
			} catch (error) {
				if (!cancelled) {
					setConnectionError(error instanceof Error ? error.message : String(error));
					setConnectionReady(false);
					setConnectionProgress((current) => ({
						...current,
						message: "Validation failed. Press r to retry."
					}));
				}
			}
		};

		void runValidation();
		return () => {
			cancelled = true;
		};
	}, [validationAttempt]);

	React.useEffect(() => {
		const timer = setInterval(() => {
			setSpinnerIndex((current: number) => (current + 1) % SPINNER_FRAMES.length);
		}, 120);

		return () => clearInterval(timer);
	}, []);

	useInput((input, key) => {
		if (connectionReady && (key.return || input === " ")) {
			props.onContinue();
			return;
		}

		if (input.toLowerCase() === "r") {
			setConnectionError(null);
			setConnectionReady(false);
			setValidationAttempt((current) => current + 1);
			return;
		}

		if (key.ctrl && input === "c") {
			requestExit(exit);
		}
	});

	const spinner = SPINNER_FRAMES[spinnerIndex];
	const progressPercent = Math.min(100, Math.round((connectionProgress.current / connectionProgress.total) * 100));
	const progressBarLength = 12;
	const progressFilled = Math.round((progressPercent / 100) * progressBarLength);
	const progressBar = `${"█".repeat(progressFilled)}${"░".repeat(progressBarLength - progressFilled)}`;

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0, width: 96 },
		React.createElement(Text, { bold: true, color: "cyan" }, connectionReady ? "Application 3 Connection Verified" : connectionError ? "Application 3 Connection Failed" : "Checking Application 3 Connection"),
		React.createElement(Text, null, connectionStatus),
		React.createElement(Text, null, `Progress: [${progressBar}] ${progressPercent}% (${connectionProgress.current}/${connectionProgress.total})`),
		React.createElement(Text, null, `Target: ${readConnectionTarget()}`),
		connectionError ? React.createElement(Text, { color: "red" }, `Error: ${connectionError}`) : null,
		connectionReady ? React.createElement(Text, { color: "green" }, "Connection validated. Press Enter or Space to continue.") : React.createElement(Text, { color: "yellow" }, `Connecting ${spinner}`),
		React.createElement(Text, { dimColor: true }, connectionReady ? "Press r to recheck, Ctrl+C to quit." : "Wait for validation to finish; press r to retry or Ctrl+C to quit.")
	);
}

function renderVerificationSection(verification: Application3VerificationResult | null) {
	if (!verification) {
		return React.createElement(Text, { dimColor: true }, "Press v to verify the output file.");
	}

	const statusColor = verification.ok ? "green" : "red";
	const issuePreview = verification.issues.slice(0, 5).map((issue, index) =>
		React.createElement(Text, { key: `${issue.rowNumber}-${index}` }, `  - ${issue.message}`)
	);

	return React.createElement(
		React.Fragment,
		null,
		React.createElement(Text, { color: statusColor, bold: true }, verification.ok ? "Verification passed" : "Verification failed"),
		React.createElement(Text, null, `  Rows: ${verification.rowCount}/${verification.expectedRowCount}`),
		React.createElement(Text, null, `  Matched rows: ${verification.matchedRows}`),
		React.createElement(Text, null, `  Issues: ${verification.issueCount}`),
		...issuePreview,
		verification.issues.length > 5 ? React.createElement(Text, { dimColor: true }, `  ...and ${verification.issues.length - 5} more issue(s).`) : null
	);
}

function DashboardUi() {
	const { exit } = useApp();
	const [state, setState] = React.useState<DashboardState>({
		status: "Ready",
		loading: false,
		error: null,
		verification: null,
		notice: null,
		spinnerIndex: 0,
		reportPath: path.resolve(process.cwd(), APPLICATION_3_REPORT_FILE)
	});

	React.useEffect(() => {
		const timer = setInterval(() => {
			setState((current) => ({ ...current, spinnerIndex: (current.spinnerIndex + 1) % SPINNER_FRAMES.length }));
		}, 120);

		return () => clearInterval(timer);
	}, []);

	const runVerification = React.useCallback(async () => {
		setState((current) => ({
			...current,
			loading: true,
			error: null,
			notice: null,
			status: "Verifying output file..."
		}));

		try {
			const verification = await verifyApplication3OutputFile();
			setState((current) => ({
				...current,
				loading: false,
				verification,
				status: verification.ok ? "Verification complete." : "Verification found differences."
			}));
		} catch (error) {
			setState((current) => ({
				...current,
				loading: false,
				error: error instanceof Error ? error.message : String(error),
				status: "Verification failed to run."
			}));
		}
	}, []);

	const writeReport = React.useCallback(async () => {
		setState((current) => ({ ...current, loading: true, notice: null }));

		try {
			const report = await writeApplication3VerificationReport({ reportPath: state.reportPath });
			setState((current) => ({
				...current,
				loading: false,
				verification: report,
				notice: `Wrote report to ${formatShortPath(report.reportPath ?? state.reportPath)}`,
				status: report.ok ? "Report written." : "Report written with differences."
			}));
		} catch (error) {
			setState((current) => ({
				...current,
				loading: false,
				error: error instanceof Error ? error.message : String(error),
				status: "Could not write report."
			}));
		}
	}, [state.reportPath]);

	useInput((input, key) => {
		if (key.ctrl && input === "c") {
			requestExit(exit);
			return;
		}

		if (input.toLowerCase() === "q") {
			requestExit(exit);
			return;
		}

		if (input.toLowerCase() === "v" && !state.loading) {
			void runVerification();
			return;
		}

		if (input.toLowerCase() === "w" && !state.loading) {
			void writeReport();
			return;
		}

		if (input.toLowerCase() === "r" && !state.loading) {
			void runVerification();
		}
	});

	const spinner = SPINNER_FRAMES[state.spinnerIndex];

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: state.error ? "red" : "cyan", paddingX: 1, paddingY: 0, width: 96 },
		React.createElement(Text, { bold: true, color: "cyan" }, "Application 3 Dashboard"),
		React.createElement(Text, null, `Status: ${state.loading ? `loading ${spinner}` : state.status}`),
		state.error ? React.createElement(Text, { color: "red" }, state.error) : null,
		state.notice ? React.createElement(Text, { color: "yellow" }, state.notice) : null,
		React.createElement(Text, { bold: true }, "Verification"),
		renderVerificationSection(state.verification),
		React.createElement(Text, null, `  Output file: ${OUTPUT_FILE_LABEL}`),
		React.createElement(Text, null, `  Report file: ${REPORT_FILE_LABEL}`),
		React.createElement(Text, { dimColor: true }, "Keys: v verify, w write report, r refresh, q quit"),
		state.loading ? React.createElement(Text, { color: "yellow" }, `Working ${spinner}`) : null
	);
}

function Application3UiApp() {
	const [phase, setPhase] = React.useState<UiPhase>("welcome");

	if (phase === "welcome") {
		return React.createElement(ConnectionTestUi, { onContinue: () => setPhase("dashboard") });
	}

	return React.createElement(DashboardUi);
}

export function renderApplication3Ui() {
	return render(React.createElement(Application3UiApp));
}