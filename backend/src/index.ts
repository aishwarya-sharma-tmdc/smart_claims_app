import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getAdapter } from "./adapter.js";
import { requireToken } from "./semantic/client.js";
import { overviewRouter } from "./routes/overview.js";
import { claimantsRouter } from "./routes/claimants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Normalize BASE_PATH -> "" (root) or "/prefix" (leading slash, no trailing).
const trimmedBase = (process.env.BASE_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
const normalizedBase = trimmedBase ? `/${trimmedBase}` : "";
const baseHref = `${normalizedBase}/`;

const app = express();
app.use(cors());
app.use(express.json());

const router = express.Router();

router.get("/api/health", (_req, res) =>
  res.json({ ok: true, basePath: normalizedBase || "/" })
);
// Manual cache-bust for the signed-in user (the app's refresh button).
router.post("/api/refresh", (req, res, next) => {
  try {
    getAdapter().clear(requireToken(req));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
router.use("/api/overview", overviewRouter);
router.use("/api/claimants", claimantsRouter);

// Serve the built frontend (present in production images). STATIC_DIR overrides.
const staticDir = process.env.STATIC_DIR || path.join(__dirname, "../public");
const indexHtmlPath = path.join(staticDir, "index.html");

if (fs.existsSync(indexHtmlPath)) {
  const rawIndex = fs.readFileSync(indexHtmlPath, "utf8");
  const indexHtml = rawIndex.replace(/<base\s+href="[^"]*"\s*\/?>/i, `<base href="${baseHref}" />`);
  router.use(express.static(staticDir, { index: false }));
  router.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.type("html").send(indexHtml);
  });
}

if (normalizedBase) app.use(normalizedBase, router);
app.use(router);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err?.message ?? "Internal error" });
});

app.listen(config.port, () => {
  console.log(
    `Smart Claims API on http://localhost:${config.port}${normalizedBase || ""} (env: ${config.env})`
  );
  // No cache warm at boot: every request is authenticated with the user's own
  // access token, so there's no service token to query with up front.
});
