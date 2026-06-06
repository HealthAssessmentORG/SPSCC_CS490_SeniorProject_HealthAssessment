import React from "react";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Box, Text, render, useApp, useInput } from "ink";

type AppKey = "ui:app1" | "ui:app2" | "ui:app3";

type LauncherState = {
	status: string;
	launching: boolean;
	selectedIndex: number;
};

type LauncherChoice = AppKey | "quit";

const APPS: Array<{ key: AppKey; label: string; description: string }> = [
	{ key: "ui:app1", label: "ui:app1", description: "Application 1 data filler" },
	{ key: "ui:app2", label: "ui:app2", description: "Application 2 dashboard" },
	{ key: "ui:app3", label: "ui:app3", description: "Application 3 verification UI" }
];

function resolveAppEntry(appKey: AppKey): { script: string; args: string[] } {
	if (appKey === "ui:app1") {
		return { script: resolve(process.cwd(), "Application", "01", "main.ts"), args: [] };
	}

	if (appKey === "ui:app2") {
		return { script: resolve(process.cwd(), "Application", "02", "ui.ts"), args: [] };
	}

	return { script: resolve(process.cwd(), "Application", "03", "main.ts"), args: ["ui"] };
}

function resolveAppCommand(appKey: AppKey): { command: string; args: string[] } {
	const entry = resolveAppEntry(appKey);
	return {
		command: process.execPath,
		args: ["--import", "tsx", entry.script, ...entry.args]
	};
}

function usage(exitCode = 0): never {
	const message = [
		"Usage:",
		"  node --import tsx Application/main.ts",
		"  node --import tsx Application/main.ts ui:app1",
		"  node --import tsx Application/main.ts ui:app2",
		"  node --import tsx Application/main.ts ui:app3",
		"",
		"Launches one of the existing application UIs and returns to the launcher after it exits."
	].join("\n");

	process.stdout.write(message + "\n");
	process.exit(exitCode);
}

function parseArgs(argv: string[]): AppKey | "launcher" {
	if (argv.length === 0) {
		return "launcher";
	}

	const [command, ...rest] = argv;
	if (command === "-h" || command === "--help") {
		usage(0);
	}

	if (rest.length > 0) {
		throw new Error(`Unknown argument for ${command}: ${rest[0]}`);
	}

	if (command === "ui:app1" || command === "ui:app2" || command === "ui:app3") {
		return command;
	}

	return "launcher";
}

function launchSelectedApp(appKey: AppKey): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	const { command, args } = resolveAppCommand(appKey);
	return new Promise((resolveResult, rejectResult) => {
		const child = spawn(command, args, {
			cwd: process.cwd(),
			stdio: "inherit",
			env: process.env,
			windowsHide: false
		});

		child.on("error", (error: unknown) => {
			rejectResult(error);
		});

		child.on("close", (code, signal) => {
			resolveResult({ code, signal });
		});
	});
}

function LauncherUi(props: { onChoose: (choice: LauncherChoice) => void }) {
	const { exit } = useApp();
	const [state, setState] = React.useState<LauncherState>({
		status: "Choose an application to launch.",
		launching: false,
		selectedIndex: 0
	});

	// Prevent immediately accepting stray keystrokes that were entered
	// while a child application was running (avoids accidental re-launch).
	const [acceptInput, setAcceptInput] = React.useState(false);

	React.useEffect(() => {
		process.title = "Application Launcher";
		const timer = setTimeout(() => setAcceptInput(true), 150);
		return () => clearTimeout(timer);
	}, []);

	useInput((input, key) => {
		if (!acceptInput) {
			// swallow input that arrived too soon after returning from child
			return;
		}
		if (key.ctrl && input === "c") {
			props.onChoose("quit");
			exit();
			return;
		}

		if (key.upArrow) {
			setState((current) => ({
				...current,
				selectedIndex: current.selectedIndex === 0 ? APPS.length - 1 : current.selectedIndex - 1
			}));
			return;
		}

		if (key.downArrow) {
			setState((current) => ({
				...current,
				selectedIndex: (current.selectedIndex + 1) % APPS.length
			}));
			return;
		}

		if (key.return) {
			const choice = APPS[state.selectedIndex]?.key;
			if (choice) {
				props.onChoose(choice);
				exit();
			}
			return;
		}

		if (input === "1") {
			props.onChoose("ui:app1");
			exit();
			return;
		}

		if (input === "2") {
			props.onChoose("ui:app2");
			exit();
			return;
		}

		if (input === "3") {
			props.onChoose("ui:app3");
			exit();
			return;
		}

		if (input.toLowerCase() === "q") {
			props.onChoose("quit");
			exit();
		}
	});

	return React.createElement(
		Box,
		{ flexDirection: "column", borderStyle: "round", borderColor: "cyan", paddingX: 1, paddingY: 0, width: 96 },
		React.createElement(Text, { bold: true, color: "cyan" }, "Application Launcher"),
		React.createElement(Text, null, state.status),
		React.createElement(Text, { dimColor: true }, "Use up/down arrows or 1-3, then Enter to launch. q quits the launcher."),
		...APPS.map((app, index) => {
			const selected = index === state.selectedIndex;
			const textProps = selected
				? { key: app.key, color: "green" as const }
				: { key: app.key };
			return React.createElement(
				Text,
				textProps,
				`${selected ? ">" : " "} ${index + 1}. ${app.label} - ${app.description}`
			);
		}),
		React.createElement(Text, { dimColor: true }, "The selected application runs in the same terminal and returns here when it exits."),
		React.createElement(Text, { dimColor: true }, "Press Enter or 1-3 to launch, q to quit.")
	);
}

async function runSelectedApp(appKey: AppKey): Promise<void> {
	const result = await launchSelectedApp(appKey);
	if (result.code !== 0) {
		process.exitCode = result.code ?? 1;
	}
}

async function runLauncherOnce(): Promise<LauncherChoice> {
	let choice: LauncherChoice = "quit";
	const app = render(
		React.createElement(LauncherUi, {
			onChoose: (selectedChoice) => {
				choice = selectedChoice;
			}
		})
	);

	await app.waitUntilExit();
	return choice;
}

async function main() {
	let command: AppKey | "launcher";

	try {
		command = parseArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		usage(1);
	}

	if (command !== "launcher") {
		await runSelectedApp(command);
		return;
	}

	while (true) {
		const choice = await runLauncherOnce();
		if (choice === "quit") {
			return;
		}

		await runSelectedApp(choice);
	}
}

void main().catch((error) => {
	console.error("Failed to run Application launcher:", error);
	process.exitCode = 1;
});
