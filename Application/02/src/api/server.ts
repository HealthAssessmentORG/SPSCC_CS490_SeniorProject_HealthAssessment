import http from "node:http";

import {
  getApplication2DatabaseStatus,
  type Application2DatabaseStatusBody,
  type Application2DatabaseStatusDeps
} from "./database_status";
import {
  getApplication2DatabaseSummary,
  type Application2DatabaseSummaryBody,
  type Application2DatabaseSummaryDeps
} from "./database_summary";

export type Application2ServerDeps = Application2DatabaseStatusDeps & Application2DatabaseSummaryDeps;

type JsonBody = Application2DatabaseStatusBody | Application2DatabaseSummaryBody | { ok: false; error: string };

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  body: JsonBody,
  extraHeaders?: Record<string, string>
) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...(extraHeaders ?? {})
  });
  res.end(JSON.stringify(body));
}

export function createApplication2Server(deps: Application2ServerDeps = {}): http.Server {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://application2.local").pathname;

    if (pathname === "/database/status") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" }, { Allow: "GET" });
        return;
      }

      const status = await getApplication2DatabaseStatus(deps);
      sendJson(res, status.statusCode, status.body);
      return;
    }

    if (pathname === "/database/summary") {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" }, { Allow: "GET" });
        return;
      }

      const summary = await getApplication2DatabaseSummary(deps);
      sendJson(res, summary.statusCode, summary.body);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });
}
