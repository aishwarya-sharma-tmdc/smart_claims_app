import type { Request } from "express";
import { config } from "../config.js";

// ── Cube.js / DataOS semantic REST client ───────────────────────────────────
// The query API is asynchronous and columnar:
//   1. POST {base}/api/v1/query/semantic/rest   with { query: <cube query> }  → { id, status }
//   2. GET  {base}/api/v1/query/statement/{id}                                 → { status }
//   3. GET  {base}/api/v1/query/statement/{id}/result?format=json             → { cols, rows, row_count }
// Rows come back as arrays aligned to `cols`; we zip them into objects keyed by
// the fully-qualified member name (e.g. "CLAIM_LIFECYCLE.CLAIM_ID").

export type CubeQuery = Record<string, unknown>;
export type Row = Record<string, any>;

interface StatementResult {
  cols: string[];
  rows: any[][];
  row_count?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Raised when a request reaches the semantic layer without a user token. Routes
// map this to an HTTP 401 so the frontend re-authenticates.
export class MissingTokenError extends Error {
  status = 401;
  constructor(message = "No DataOS access token provided.") {
    super(message);
    this.name = "MissingTokenError";
  }
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Extract the user's bearer token from the request's Authorization header.
// Throws MissingTokenError (→ HTTP 401) when absent so the frontend re-auths.
export function requireToken(req: Request): string {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) throw new MissingTokenError();
  return token;
}

// Fetch JSON, retrying on non-2xx or HTML error pages (the gateway returns HTML
// when it throttles a burst of async jobs).
async function jsonFetch(url: string, opts: RequestInit = {}, tries = 4): Promise<any> {
  let lastErr = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, opts);
    const text = await res.text();
    const looksJson = text.trimStart().startsWith("{") || text.trimStart().startsWith("[");
    if (res.ok && looksJson) return JSON.parse(text);
    lastErr = `${res.status} ${text.slice(0, 140).replace(/\s+/g, " ")}`;
    if (attempt < tries) await sleep(1500 * attempt);
  }
  throw new Error(`Semantic API request failed (${url.split("/api/")[1] ?? url}): ${lastErr}`);
}

// Submit → poll → fetch one page of results, authenticated as the given user token.
async function runPage(query: CubeQuery, token: string): Promise<StatementResult> {
  if (!config.semantic.url) {
    throw new Error("SEMANTIC_API_URL is not configured (set it in .env).");
  }
  if (!token) {
    throw new MissingTokenError();
  }
  const base = config.semantic.url;
  const headers = authHeaders(token);
  const submit = await jsonFetch(`${base}/api/v1/query/semantic/rest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const id = submit.id;
  if (!id) throw new Error(`No statement id returned: ${JSON.stringify(submit).slice(0, 200)}`);

  let status: string = submit.status;
  const started = Date.now();
  while (status !== "SUCCESS" && status !== "FAILED") {
    if (Date.now() - started > config.semantic.pollTimeoutMs) {
      throw new Error(`Polling timed out (last status=${status})`);
    }
    await sleep(1500);
    const st = await jsonFetch(`${base}/api/v1/query/statement/${id}`, { headers });
    status = st.status;
    if (status === "FAILED") {
      throw new Error(`Query FAILED: ${JSON.stringify(st.error ?? st).slice(0, 200)}`);
    }
  }

  const result = await jsonFetch(
    `${base}/api/v1/query/statement/${id}/result?format=json`,
    { headers }
  );
  return { cols: result.cols ?? [], rows: result.rows ?? [], row_count: result.row_count };
}

function zip(cols: string[], rows: any[][]): Row[] {
  return rows.map((r) => {
    const o: Row = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i];
    return o;
  });
}

// Fetch a query's rows.
//  - If the query sets an explicit `limit`, it is a HARD CAP (single request).
//  - If no `limit` is set, we page through with `offset` until a short page returns.
export async function runQuery(query: CubeQuery, token: string): Promise<Row[]> {
  const hasCap = query.limit != null;
  if (hasCap) {
    const page = await runPage(query, token);
    return zip(page.cols, page.rows);
  }
  const pageSize = config.semantic.pageSize;
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const page = await runPage({ ...query, limit: pageSize, offset }, token);
    out.push(...zip(page.cols, page.rows));
    if (page.rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

// Run many queries with bounded concurrency (avoids gateway throttling).
export async function runAll<T extends Record<string, CubeQuery>>(
  queries: T,
  token: string
): Promise<{ [K in keyof T]: Row[] }> {
  const entries = Object.entries(queries);
  const results: Record<string, Row[]> = {};
  let idx = 0;
  const worker = async () => {
    while (idx < entries.length) {
      const [key, query] = entries[idx++];
      results[key] = await runQuery(query, token);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, config.semantic.concurrency) }, worker)
  );
  return results as { [K in keyof T]: Row[] };
}

// ── value coercion helpers (measures often come back as strings) ─────────────
export function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
export function int(v: any): number {
  return Math.round(num(v) ?? 0);
}
export function iso(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}
export function monthKey(v: any): string | null {
  const s = iso(v);
  return s ? s.slice(0, 7) : null;
}
export function truthy(v: any): boolean {
  return v === true || v === "true" || v === "True" || v === "Y" || v === 1 || v === "1";
}
