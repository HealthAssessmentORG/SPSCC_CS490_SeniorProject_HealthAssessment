import React from "react";
import { Box, Text, render, useInput, useApp } from "ink";
import sql from "mssql";

export type ExampleUiModel = {
	status: string;
	options: string[];
	onRunRandomRows: (
		seed: number | null,
		assessmentCount: number,
		mode?: "full" | "faker" | "sql"
	) => Promise<{
		status: string;
		generatedResponses?: Array<{
			assessment_number: number;
			field_id: number;
			field_name: string;
			response: string;
		}>;
	}>;
};

type InputMode = "none" | "seed" | "assessmentCount";
type UiPhase = "welcome" | "choice" | "menu" | "dataView";

type ValidationProgress = {
	current: number;
	total: number;
	message: string;
};

type GeneratedResponse = {
	assessment_number: number;
	field_id: number;
	field_name: string;
	response: string;
};

const RANDOM_ROWS_MSSQL_CONN_STRING =
	process.env["MSSQL_CONN_STRING"] ??
	"SERVER=24.18.27.110;DATABASE=DD2975_PreDHA;UID=sa;PWD=3939;Encrypt=no;";

function readConnectionTarget(connectionString: string): string {
	const serverMatch = connectionString.match(/(?:^|;)\s*SERVER=([^;]+)/i);
	const databaseMatch = connectionString.match(/(?:^|;)\s*DATABASE=([^;]+)/i);
	const server = serverMatch?.[1]?.trim();
	const database = databaseMatch?.[1]?.trim();

	if (server && database) {
		return `${server} / ${database}`;
	}

	return "random_rows.py MSSQL server";
}

async function validateRandomRowsConnection(
	onProgress: (progress: ValidationProgress) => void
): Promise<void> {
	onProgress({
		current: 1,
		total: 3,
		message: `Opening SQL Server connection for ${readConnectionTarget(RANDOM_ROWS_MSSQL_CONN_STRING)}`
	});
	const pool = await sql.connect(RANDOM_ROWS_MSSQL_CONN_STRING);

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

function requestExit(exit: () => void) {
	exit();
	process.exit(0);
}

function PhaseTitle(props: { phase: UiPhase }) {
	if (props.phase === "welcome") {
		return "Checking MSSQL Connection";
	}

	if (props.phase === "choice") {
		return "Choose a Screen";
	}

	if (props.phase === "dataView") {
		return "Application 1 Data Viewer";
	}

	return "Application 1 Main Screen";
}

function MenuUi(props: ExampleUiModel & { onViewAssessment: () => void; onGeneratedResponses: (responses: GeneratedResponse[]) => void; generatedResponses: GeneratedResponse[] }) {
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const [status, setStatus] = React.useState(props.status);
	const [busy, setBusy] = React.useState(false);
	const [spinnerIndex, setSpinnerIndex] = React.useState(0);
	const [seed, setSeed] = React.useState<number | null>(null);
	const [assessmentCount, setAssessmentCount] = React.useState(1);
	const [inputMode, setInputMode] = React.useState<InputMode>("none");
	const [inputValue, setInputValue] = React.useState("");

	React.useEffect(() => {
		if (!busy) {
			setSpinnerIndex(0);
			return;
		}

		const timer = setInterval(() => {
			setSpinnerIndex((current: number) => (current + 1) % 4);
		}, 120);

		return () => clearInterval(timer);
	}, [busy]);

	const selectCurrent = async () => {
		const selected = props.options[selectedIndex];

		if (selected === "Generate Assessment(s)") {
			setBusy(true);
			setStatus("Generating faker data...");
			try {
				const result = await props.onRunRandomRows(seed, assessmentCount, "faker");
				setStatus(result.status);
				props.onGeneratedResponses(result.generatedResponses ?? []);
			} catch (error) {
				setStatus(`Run failed: ${String(error)}`);
			} finally {
				setBusy(false);
			}
			return;
		}

		if (selected === "View Assessment") {
			if (props.generatedResponses.length === 0) {
				setStatus("Generate assessments first, then open the viewer.");
				return;
			}

			props.onViewAssessment();
			return;
		}

		if (selected === "Insert into Database") {
			setBusy(true);
			setStatus("Executing SQL statements...");
			try {
				const result = await props.onRunRandomRows(seed, assessmentCount, "sql");
				setStatus(result.status);
			} catch (error) {
				setStatus(`Run failed: ${String(error)}`);
			} finally {
				setBusy(false);
			}
			return;
		}

		if (selected === "Generate and Insert") {
			setBusy(true);
			setStatus("Running full data fill...");
			try {
				const result = await props.onRunRandomRows(seed, assessmentCount, "full");
				setStatus(result.status);
			} catch (error) {
				setStatus(`Run failed: ${String(error)}`);
			} finally {
				setBusy(false);
			}
			return;
		}

		if (selected === "Edit Seed") {
			setInputMode("seed");
			setInputValue(seed === null ? "" : String(seed));
			return;
		}

		if (selected === "Edit Assessment Count") {
			setInputMode("assessmentCount");
			setInputValue(String(assessmentCount));
			return;
		}

		if (selected === "Exit") {
			requestExit(exit);
		}
	};

	useInput((input, key) => {
		if (inputMode !== "none") {
			// In input mode
			if (key.return) {
				if (inputMode === "seed" && inputValue.trim() === "") {
					setSeed(null);
					setStatus("Seed cleared. Faker generation will not be seeded.");
					setInputMode("none");
					setInputValue("");
					return;
				}

				const numValue = parseInt(inputValue, 10);
				if (!Number.isNaN(numValue) && numValue > 0) {
					if (inputMode === "seed") {
						setSeed(numValue);
					} else if (inputMode === "assessmentCount") {
						setAssessmentCount(numValue);
					}
					setStatus(`${inputMode === "seed" ? "Seed" : "Assessment Count"} updated.`);
				} else {
					setStatus("Invalid number. Please enter a positive integer.");
				}
				setInputMode("none");
				setInputValue("");
				return;
			}

			if (key.escape) {
				setInputMode("none");
				setInputValue("");
				return;
			}

			if (key.backspace) {
				setInputValue((current: string) => current.slice(0, -1));
				return;
			}

			// Allow typing digits and basic characters
			if (/^[0-9]$/.test(input)) {
				setInputValue((current: string) => current + input);
				return;
			}
			return;
		}

		// Menu mode
		if (busy) return;

		if (key.upArrow) {
			setSelectedIndex((current: number) => (current === 0 ? props.options.length - 1 : current - 1));
			return;
		}

		if (key.downArrow) {
			setSelectedIndex((current: number) => (current + 1) % props.options.length);
			return;
		}

		if (key.return) {
			void selectCurrent();
			return;
		}

		if (input.toLowerCase() === "q") {
			exit();
		}
	});

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0 },
		React.createElement(Text, { bold: true, color: "cyan" }, "Data Filling"),
		React.createElement(Text, null, `Status: ${status}`),
		React.createElement(Text, null, `Seed: ${seed === null ? "not set" : seed}, Assessment Count: ${assessmentCount}`),
		busy
			? React.createElement(Text, { color: "yellow" }, `Working ${["|", "/", "-", "\\"][spinnerIndex]}`)
			: null,
		inputMode !== "none"
			? React.createElement(
					React.Fragment,
					null,
					React.createElement(
						Text,
						null,
						inputMode === "seed"
							? `Enter seed (positive integer, or leave blank to clear): ${inputValue}`
							: `Enter assessment count (positive integer): ${inputValue}`
					),
					React.createElement(Text, { dimColor: true }, "Press Enter to confirm, Esc to cancel.")
				)
			: React.createElement(
					React.Fragment,
					null,
					React.createElement(Text, { dimColor: true }, "Use up/down arrows, Enter to select, q to quit."),
					React.createElement(Text, { dimColor: true }, "Menu:"),
					...props.options.map((option, index) => {
						const selected = index === selectedIndex;
						return React.createElement(
							Text,
							selected ? { key: `${index}-${option}`, color: "green" } : { key: `${index}-${option}` },
							`${selected ? ">" : " "} ${option}`
						);
					})
				)
	);
}

function ChoiceUi(props: { onSelectMain: () => void; onSelectDataView: () => void }) {
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const options = ["Open Data Filling Screen", "Open Data Viewing Screen"];

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((current) => (current === 0 ? options.length - 1 : current - 1));
			return;
		}

		if (key.downArrow) {
			setSelectedIndex((current) => (current + 1) % options.length);
			return;
		}

		if (key.return) {
			if (selectedIndex === 0) {
				props.onSelectMain();
			} else {
				props.onSelectDataView();
			}
			return;
		}

		if (input.toLowerCase() === "q" || (key.ctrl && input === "c")) {
			requestExit(exit);
		}
	});

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0 },
		React.createElement(Text, { bold: true, color: "cyan" }, PhaseTitle({ phase: "choice" })),
		React.createElement(Text, null, "Pick where to go next."),
		React.createElement(Text, { dimColor: true }, "Use up/down arrows, Enter to select, q to quit."),
		...options.map((option, index) => {
			const selected = index === selectedIndex;
			return React.createElement(
				Text,
				selected ? { key: `${index}-${option}`, color: "green" } : { key: `${index}-${option}` },
				`${selected ? ">" : " "} ${option}`
			);
		})
	);
}

function DataViewUi(props: { responses: GeneratedResponse[]; onBack: () => void }) {
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = React.useState(0);

	React.useEffect(() => {
		if (props.responses.length === 0) {
			setSelectedIndex(0);
			return;
		}

		setSelectedIndex((current) => Math.min(current, props.responses.length - 1));
	}, [props.responses.length]);

	useInput((input, key) => {
		if (props.responses.length > 0) {
			if (key.leftArrow || key.upArrow) {
				setSelectedIndex((current) => (current === 0 ? props.responses.length - 1 : current - 1));
				return;
			}

			if (key.rightArrow || key.downArrow) {
				setSelectedIndex((current) => (current + 1) % props.responses.length);
				return;
			}
		}

		if (key.return || input === "b") {
			props.onBack();
			return;
		}

		if (input.toLowerCase() === "q" || (key.ctrl && input === "c")) {
			requestExit(exit);
		}
	});

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0 },
		React.createElement(Text, { bold: true, color: "cyan" }, PhaseTitle({ phase: "dataView" })),
		props.responses.length === 0
			? React.createElement(Text, null, "No generated assessments available yet.")
			: React.createElement(
				React.Fragment,
				null,
				React.createElement(Text, null, `Response ${selectedIndex + 1} of ${props.responses.length}`),
				React.createElement(Text, null, `Assessment #: ${props.responses[selectedIndex].assessment_number}`),
				React.createElement(Text, null, `Field ID: ${props.responses[selectedIndex].field_id}`),
				React.createElement(Text, null, `Field Name: ${props.responses[selectedIndex].field_name}`),
				React.createElement(Text, null, `Value: ${props.responses[selectedIndex].response}`)
			)
		,
		React.createElement(Text, { dimColor: true }, "Press Enter or b to go back, q to quit.")
	);
}

function WelcomeUi(props: { onContinue: () => void }) {
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
				await validateRandomRowsConnection((progress: ValidationProgress) => {
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
						message: "Validation failed. Press r to retry or q to quit."
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
			setSpinnerIndex((current: number) => (current + 1) % 4);
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

		if (input.toLowerCase() === "q" || (key.ctrl && input === "c")) {
			requestExit(exit);
		}
	});

	const spinner = ["|", "/", "-", "\\"][spinnerIndex];
	const title = connectionReady
		? "MSSQL Connection Verified"
		: connectionError
			? "MSSQL Connection Failed"
			: "Checking MSSQL Connection";
	const progressPercent = Math.min(100, Math.round((connectionProgress.current / connectionProgress.total) * 100));
	const progressBarLength = 12;
	const progressFilled = Math.round((progressPercent / 100) * progressBarLength);
	const progressBar = `${"█".repeat(progressFilled)}${"░".repeat(progressBarLength - progressFilled)}`;

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0 },
		React.createElement(Text, { bold: true, color: "cyan" }, title),
		React.createElement(Text, null, connectionStatus),
		React.createElement(Text, null, `Progress: [${progressBar}] ${progressPercent}% (${connectionProgress.current}/${connectionProgress.total})`),
		React.createElement(Text, null, `Target: ${readConnectionTarget(RANDOM_ROWS_MSSQL_CONN_STRING)}`),
		connectionError ? React.createElement(Text, { color: "red" }, `Error: ${connectionError}`) : null,
		connectionReady
			? React.createElement(Text, { color: "green" }, "Connection validated. Press Enter or Space to continue.")
			: React.createElement(Text, { color: "yellow" }, `Connecting ${spinner}`),
		React.createElement(
			Text,
			{ dimColor: true },
			connectionReady ? "Press r to recheck, q to quit." : "Wait for validation to finish; press r to retry or q to quit."
		)
	);
}

export function renderExampleUi(model: ExampleUiModel) {
	function ExampleUiApp() {
		const [phase, setPhase] = React.useState<UiPhase>("welcome");
		const [generatedResponses, setGeneratedResponses] = React.useState<GeneratedResponse[]>([]);

		if (phase === "welcome") {
			return React.createElement(WelcomeUi, {
				onContinue: () => setPhase("choice")
			});
		}

		if (phase === "choice") {
			return React.createElement(ChoiceUi, {
				onSelectMain: () => setPhase("menu"),
				onSelectDataView: () => setPhase("dataView")
			});
		}

		if (phase === "dataView") {
			return React.createElement(DataViewUi, {
				responses: generatedResponses,
				onBack: () => setPhase("choice")
			});
		}

		return React.createElement(MenuUi, {
			...model,
			generatedResponses,
			onGeneratedResponses: setGeneratedResponses,
			onViewAssessment: () => setPhase("dataView")
		});
	}

	return render(React.createElement(ExampleUiApp));
}
