import dotenv from "dotenv";
dotenv.config();

const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "dev").toLowerCase();

export const config = {
  env: appEnv === "prod" || appEnv === "production" ? "prod" : "dev",
  port: Number(process.env.PORT ?? 4100),
  semantic: {
    // Data-product BASE url; the client appends /api/v1/query/... paths.
    // Set via the SEMANTIC_API_URL env at deploy time. The per-request bearer
    // token comes from each user's OIDC session, not from env.
    url: (process.env.SEMANTIC_API_URL ?? "").replace(/\/+$/, ""),
    // How many async queries to run in parallel (gateway throttles high concurrency).
    concurrency: Number(process.env.SEMANTIC_CONCURRENCY ?? 3),
    // Max rows per page before we paginate with offset.
    pageSize: Number(process.env.SEMANTIC_PAGE_SIZE ?? 50000),
    // How long a submitted statement may take before we give up polling.
    pollTimeoutMs: Number(process.env.SEMANTIC_POLL_TIMEOUT_MS ?? 120000),
  },
  // Cache TTL for the claims snapshot (semantic is slow cold, so cache longer).
  cacheTtlMs: Number(
    process.env.CACHE_TTL_MS ?? (appEnv.startsWith("prod") ? 600000 : 120000)
  ),
};
