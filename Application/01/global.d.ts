// Local fallback typings for this folder when no project-level tsconfig/types are present.
// If you add a proper tsconfig and Node/React type resolution, you can remove these.
declare module "react";

declare module "path" {
  export function resolve(...parts: string[]): string;
}

declare module "child_process" {
  type SpawnOptions = {
    cwd?: string;
    stdio?: "inherit" | string;
  };

  type ChildProcessLike = {
    on(event: "error", listener: (error: unknown) => void): ChildProcessLike;
    on(event: "close", listener: (code: number | null) => void): ChildProcessLike;
  };

  export function spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcessLike;
}

declare const process: {
  argv: string[];
  exitCode?: number;
  cwd: () => string;
};
