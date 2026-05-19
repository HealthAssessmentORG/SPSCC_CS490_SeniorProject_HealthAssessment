import React, { useState } from "react";
import { Box, Text, render } from "ink";
import { FilePicker } from "ink-file-picker";
import dotenv from "dotenv";
import ReadFile from "./readfile.js";

dotenv.config({ quiet: true });

const DEFAULT_MAX_DISPLAY_LINES = 20;

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim().length === 0) return undefined;
  return value;
}

function readMaxDisplayLines(): number {
  const value = readOptionalEnv("APP3_MAX_DISPLAY_LINES");
  if (!value) return DEFAULT_MAX_DISPLAY_LINES;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_MAX_DISPLAY_LINES;
  return parsed;
}

function selectedPath(paths: string | string[]): string | null {
  if (Array.isArray(paths)) return paths[0] ?? null;
  return paths;
}

type SelectionScreenProps = {
  title: string;
  selectedInputPath?: string;
  onSelect: (path: string) => void;
};

function SelectionScreen({ title, selectedInputPath, onSelect }: SelectionScreenProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {selectedInputPath ? (
        <Text>
          Selected output: {selectedInputPath}
        </Text>
      ) : null}
      <FilePicker
        initialPath={process.cwd()}
        showDetails
        onSelect={(paths) => {
          const path = selectedPath(paths);
          if (path) onSelect(path);
        }}
        onCancel={() => {
          process.exit(1);
        }}
      />
    </Box>
  );
}

function App() {
  const envLayoutPath = readOptionalEnv("APP3_LAYOUT_PATH");
  const [selectedInputPath, setSelectedInputPath] = useState<string | null>(null);
  const [selectedLayoutPath, setSelectedLayoutPath] = useState<string | null>(envLayoutPath ?? null);
  const maxDisplayLines = readMaxDisplayLines();

  if (!selectedInputPath) {
    return (
      <SelectionScreen
        title="Select Application 2 fixed-width output file"
        onSelect={(path) => {
          setSelectedInputPath(path);
          setSelectedLayoutPath(envLayoutPath ?? null);
        }}
      />
    );
  }

  if (!selectedLayoutPath) {
    return (
      <SelectionScreen
        title="Select Application 3 layout JSON file"
        selectedInputPath={selectedInputPath}
        onSelect={setSelectedLayoutPath}
      />
    );
  }

  return (
    <ReadFile
      path={selectedInputPath}
      layoutPath={selectedLayoutPath}
      maxDisplayLines={maxDisplayLines}
      onBack={() => {
        setSelectedInputPath(null);
        setSelectedLayoutPath(envLayoutPath ?? null);
      }}
    />
  );
}

render(<App />);
