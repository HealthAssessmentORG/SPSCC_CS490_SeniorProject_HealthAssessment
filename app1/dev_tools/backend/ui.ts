import React from "react";
import { Box, Text, render, useInput, useApp } from "ink";

export type ExampleUiModel = {
	title: string;
	status: string;
	options: string[];
	onRunRandomRows: () => Promise<string>;
};

function MenuUi(props: ExampleUiModel) {
	const { exit } = useApp();
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const [status, setStatus] = React.useState(props.status);
	const [busy, setBusy] = React.useState(false);
	const [spinnerIndex, setSpinnerIndex] = React.useState(0);

	React.useEffect(() => {
		if (!busy) {
			setSpinnerIndex(0);
			return;
		}

		const timer = setInterval(() => {
			setSpinnerIndex((current) => (current + 1) % 4);
		}, 120);

		return () => clearInterval(timer);
	}, [busy]);

	const selectCurrent = async () => {
		const selected = props.options[selectedIndex];

		if (selected === "Run random_rows.py") {
			setBusy(true);
			setStatus("Running random_rows.py...");
			try {
				const result = await props.onRunRandomRows();
				setStatus(result);
			} catch (error) {
				setStatus(`Run failed: ${String(error)}`);
			} finally {
				setBusy(false);
			}
			return;
		}

		if (selected === "Exit") {
			exit();
		}
	};

	useInput((input, key) => {
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
		busy
			? React.createElement(Text, { color: "yellow" }, `Working ${["|", "/", "-", "\\"][spinnerIndex]}`)
			: null,
		React.createElement(Text, { dimColor: true }, "Use up/down arrows, Enter to select, q to quit."),
		React.createElement(Text, { dimColor: true }, "Menu:"),
		...props.options.map((option, index) => {
			const selected = index === selectedIndex;
			return React.createElement(
				Text,
				{ key: `${index}-${option}`, color: selected ? "green" : undefined },
				`${selected ? ">" : " "} ${option}`
			);
		})
	);
}

export function renderExampleUi(model: ExampleUiModel) {
	return render(React.createElement(MenuUi, model));
}
