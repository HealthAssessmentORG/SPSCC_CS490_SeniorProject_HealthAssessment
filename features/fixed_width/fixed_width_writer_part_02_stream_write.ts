import fs from "node:fs";
import path from "node:path";

/**
 * Writes lines to a file asynchronously.
 * 
 * Creates the output directory if it doesn't exist, then streams the provided lines
 * to the specified file path, with each line separated by a newline character.
 * 
 * @param outPath - The file path where lines should be written
 * @param lines - An async iterable of strings to write to the file
 * @returns A promise that resolves when all lines have been written and the file stream is closed
 * @throws Will throw if the write stream encounters an error or if directory creation fails
 */

export async function writeLinesToFile(outPath: string, lines: AsyncIterable<string>) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const ws = fs.createWriteStream(outPath, { encoding: "utf8" });
  try {
    for await (const line of lines) {
      ws.write(line);
      ws.write("\n");
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.on("error", reject);
    });
  }
}
