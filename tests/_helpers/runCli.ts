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
  const nodeBin = process.execPath;

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

  async function runNodeWithImportTsx(): Promise<RunResult> {
    return await new Promise<RunResult>((resolve, reject) => {
      const child = spawn(nodeBin, ["--import", "tsx", "main.ts", ...args], {
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

  function isTsxIpcDenied(stderr: string): boolean {
    return /listen EPERM/i.test(stderr) && /tsx-[0-9]+\/.*\.pipe/i.test(stderr);
  }

  // Prefer direct Node + local tsx import to avoid tsx IPC edge cases in sandboxes.
  const direct = await runNodeWithImportTsx();
  const nodeMissingTsx =
    direct.code !== 0 &&
    /(ERR_MODULE_NOT_FOUND|Cannot find package 'tsx'|Cannot find module 'tsx')/i.test(direct.stderr);
  if (!nodeMissingTsx) {
    return direct;
  }

  // Fallback to npx if direct import is unavailable.
  const r1 = await runNpx(["--no-install", "tsx", "main.ts", ...args]);
  const looksLikeNoInstallUnsupported =
    r1.code !== 0 &&
    /no-install/i.test(r1.stderr) &&
    /(unknown|unrecognized|invalid)/i.test(r1.stderr);

  if (looksLikeNoInstallUnsupported) {
    // Fallback for older npm versions.
    const r2 = await runNpx(["tsx", "main.ts", ...args]);
    if (r2.code !== 0 && isTsxIpcDenied(r2.stderr)) {
      return await runNodeWithImportTsx();
    }
    return r2;
  }

  if (r1.code !== 0 && isTsxIpcDenied(r1.stderr)) {
    return await runNodeWithImportTsx();
  }

  return r1;
}
