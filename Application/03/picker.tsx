import React from 'react';
import { render } from 'ink';
import { FilePicker } from 'ink-file-picker';

function App() {
  return (
    <FilePicker
      initialPath={process.cwd()}
      showDetails
      onSelect={(paths) => {
        console.log('Selected:', paths);
        process.exitCode = 0;
      }}
      onCancel={() => {
        console.log('Cancelled');
        process.exitCode = 1;
      }}
    />
  );
}

render(<App />);