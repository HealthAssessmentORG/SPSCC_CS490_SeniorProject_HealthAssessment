import React, { useState } from 'react';
import { render } from 'ink';
import { FilePicker } from 'ink-file-picker';
import ReadFile from './readfile';

function App() {
  const [selected, setSelected] = useState<string | null>(null);

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

  return <ReadFile path={selected} onBack={() => setSelected(null)} />;
}

render(<App />);