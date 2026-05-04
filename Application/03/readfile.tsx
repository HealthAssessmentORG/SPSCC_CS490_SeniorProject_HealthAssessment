import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import fs from 'fs/promises';

type Props = {
  path: string;
  onBack?: () => void;
};

export default function ReadFile({ path, onBack }: Props) {
  const { exit } = useApp();
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fs.readFile(path, 'utf8')
      .then((data) => {
        if (!cancelled) {
          setContent(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setContent('');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useInput((input) => {
    if (input === 'q') {
      exit();
      setTimeout(() => process.exit(0), 0);
    }
    if (input === 'b' && onBack) onBack();
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>File:</Text>
        <Text> {path}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {loading && <Text color="yellow">Loading...</Text>}
        {error && <Text color="red">Error: {error}</Text>}
        {!loading && !error && <Text>{content}</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press 'b' to go back, 'q' to quit.</Text>
      </Box>
    </Box>
  );
}
