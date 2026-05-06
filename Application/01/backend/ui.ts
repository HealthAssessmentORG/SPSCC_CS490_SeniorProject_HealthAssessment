import React from "react";
import { Box, Text, render, useInput, useApp } from "ink";

export type ExampleUiModel = {
	title: string;
	status: string;
	options: string[];
	onRunRandomRows: (seed: number | null, assessmentCount: number) => Promise<string>;
};

type InputMode = "none" | "seed" | "assessmentCount";

function MenuUi(props: ExampleUiModel) {
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

		if (selected === "Run random_rows.py") {
			setBusy(true);
			setStatus("Running random_rows.py...");
			try {
				const result = await props.onRunRandomRows(seed, assessmentCount);
				setStatus(result);
			} catch (error) {
				setStatus(`Run failed: ${String(error)}`);
			} finally {
				setBusy(false);
			}
			return;
		}

		if (selected === "Edit Seed") {
			setInputMode("seed");
			setInputValue(String(seed));
			return;
		}

		if (selected === "Edit Assessment Count") {
			setInputMode("assessmentCount");
			setInputValue(String(assessmentCount));
			return;
		}

		if (selected === "Clear Seed") {
			setSeed(null);
			setStatus("Seed cleared.");
			return;
		}

		if (selected === "Exit") {
			exit();
		}
	};

	useInput((input, key) => {
		if (inputMode !== "none") {
			// In input mode
			if (key.return) {
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
				setInputValue((current) => current.slice(0, -1));
				return;
			}

			// Allow typing digits and basic characters
			if (/^[0-9]$/.test(input)) {
				setInputValue((current) => current + input);
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
		React.createElement(Text, { bold: true, color: "cyan" }, props.title),
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
						`Enter ${inputMode === "seed" ? "seed" : "assessment count"} (positive integer): ${inputValue}`
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

export function renderExampleUi(model: ExampleUiModel) {
	return render(React.createElement(MenuUi, model));
}
