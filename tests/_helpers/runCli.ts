import { spawn } from "node:child_process";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * Runs the TS CLI (`main.ts`) using the repo-local `tsx`.
 *
 * Requirements:
 * - `npm install` must have been run
 * - This helper uses `npx --no-install` so it will NOT download packages.
 */
export async function runCli(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string | undefined> }
): Promise<RunResult> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  async function runNpx(npxArgs: string[]): Promise<RunResult> {
    return await new Promise<RunResult>((resolve, reject) => {
      const child = spawn(npx, npxArgs, {
        cwd: opts?.cwd ?? process.cwd(),
        env: { ...process.env, ...(opts?.env ?? {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));

      child.on("error", (err) => reject(err));
      child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  }

  // Prefer no-install (won't download packages).
  const r1 = await runNpx(["--no-install", "tsx", "main.ts", ...args]);
  const looksLikeNoInstallUnsupported =
    r1.code !== 0 &&
    /no-install/i.test(r1.stderr) &&
    /(unknown|unrecognized|invalid)/i.test(r1.stderr);

  if (looksLikeNoInstallUnsupported) {
    // Fallback for older npm versions.
    return await runNpx(["tsx", "main.ts", ...args]);
  }

  return r1;
}
