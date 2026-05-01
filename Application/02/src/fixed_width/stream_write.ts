import fs from "node:fs";
import path from "node:path";

type WriteLinesToFileOptions = {
  onLineWritten?: (writtenCount: number) => void | Promise<void>;
};

async function writeLine(ws: fs.WriteStream, line: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.write(line);
    ws.write("\n", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function writeLinesToFile(
  outPath: string,
  lines: AsyncIterable<string>,
  options: WriteLinesToFileOptions = {}
) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const ws = fs.createWriteStream(outPath, { encoding: "utf8" });
  let writtenCount = 0;
  try {
    for await (const line of lines) {
      await writeLine(ws, line);
      writtenCount += 1;
      if (options.onLineWritten) {
        await options.onLineWritten(writtenCount);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.on("error", reject);
    });
  }
}
