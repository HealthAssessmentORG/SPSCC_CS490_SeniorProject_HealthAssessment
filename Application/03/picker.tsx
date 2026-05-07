import "dotenv/config";

import React, { useState } from "react";
import { render } from "ink";
import { FilePicker } from "ink-file-picker";
import ReadFile from "./readfile.js";

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

function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const layoutPath = readOptionalEnv("APP3_LAYOUT_PATH");
  const maxDisplayLines = readMaxDisplayLines();

  if (!selected) {
    return (
      <FilePicker
        initialPath={process.cwd()}
        showDetails
        onSelect={(paths) => {
          const p = Array.isArray(paths) ? paths[0] : paths;
          setSelected(p as string);
        }}
        onCancel={() => {
          process.exit(1);
        }}
      />
    );
  }

  return (
    <ReadFile
      path={selected}
      layoutPath={layoutPath}
      maxDisplayLines={maxDisplayLines}
      onBack={() => setSelected(null)}
    />
  );
}

render(<App />);
