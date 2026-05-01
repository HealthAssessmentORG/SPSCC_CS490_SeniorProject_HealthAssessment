import { createApplication2Server } from "./src/api/server";
import { closeApplication2Pool } from "./src/db_connect";

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (value != null && value.trim() !== "") return value.trim();
  return undefined;
}

function parseApiPort(raw: string | undefined): number {
  if (!raw) return 3002;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError(`Invalid number for APP2_API_PORT: ${raw}`);
  }
  return port;
}

async function closeServer(server: ReturnType<typeof createApplication2Server>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main() {
  const host = envValue("APP2_API_HOST") ?? "127.0.0.1";
  const port = parseApiPort(envValue("APP2_API_PORT"));
  const server = createApplication2Server();
  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    await closeServer(server);
    await closeApplication2Pool();
  }

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  server.on("error", (error) => {
    console.error(`[api:application2] ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.error(`[api:application2] listening http://${host}:${actualPort}`);
  });
}

main().catch(async (error) => {
  console.error((error as Error).message);
  await closeApplication2Pool();
  process.exitCode = 1;
});
