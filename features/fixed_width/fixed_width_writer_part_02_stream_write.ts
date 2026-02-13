import fs from "node:fs";
import path from "node:path";

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
