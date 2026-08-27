// Validates the SSA Smart Claims semantic-layer queries the app uses.
// Run:  npm run probe   (which does: node --env-file=.env scripts/probe.mjs)

const BASE = process.env.SEMANTIC_API_URL;
const TOKEN = process.env.SEMANTIC_API_TOKEN;
if (!BASE || !TOKEN) {
  console.error("Missing SEMANTIC_API_URL / SEMANTIC_API_TOKEN in env");
  process.exit(1);
}

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jfetch(url, opts = {}, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, opts);
    const text = await res.text();
    const looksJson = text.trim().startsWith("{") || text.trim().startsWith("[");
    if (res.ok && looksJson) return JSON.parse(text);
    if (attempt >= tries) throw new Error(`${res.status} (${text.slice(0, 100).replace(/\s+/g, " ")})`);
    await sleep(1500 * attempt);
  }
}

async function runQuery(body, { timeoutMs = 120000 } = {}) {
  const sub = await jfetch(`${BASE}/api/v1/query/semantic/rest`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const id = sub.id;
  if (!id) throw new Error(`no statement id: ${JSON.stringify(sub).slice(0, 200)}`);
  const started = Date.now();
  let status = sub.status;
  while (status !== "SUCCESS" && status !== "FAILED") {
    if (Date.now() - started > timeoutMs) throw new Error(`poll timeout (last=${status})`);
    await sleep(1500);
    const st = await jfetch(`${BASE}/api/v1/query/statement/${id}`, { headers: H });
    status = st.status;
    if (status === "FAILED") throw new Error(`FAILED: ${JSON.stringify(st.error ?? st).slice(0, 200)}`);
  }
  return jfetch(`${BASE}/api/v1/query/statement/${id}/result?format=json`, { headers: H });
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { status: "fulfilled", value: await fn(items[idx], idx) }; }
      catch (e) { results[idx] = { status: "rejected", reason: e }; }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

const QUERIES = {
  "claims.base": {
    query: {
      dimensions: [
        "CLAIM_LIFECYCLE.CLAIM_ID", "CLAIM_LIFECYCLE.CLAIMANT_ID", "CLAIM_LIFECYCLE.STATE_CODE",
        "CLAIM_LIFECYCLE.PROGRAM_TYPE", "CLAIM_LIFECYCLE.CURRENT_BUNDLE_STAGE",
        "CLAIM_LIFECYCLE.CURRENT_STAGE_INDEX", "CLAIM_LIFECYCLE.EVIDENCE_COMPLETENESS_PCT",
        "CLAIM_LIFECYCLE.CLAIM_STATUS", "CLAIM_LIFECYCLE.IS_DECIDED", "CLAIM_LIFECYCLE.IS_APPROVED",
        "CLAIM_LIFECYCLE.IS_OVERDUE", "CLAIM_LIFECYCLE.DAYS_ELAPSED",
      ],
      limit: 10, timezone: "UTC",
    },
  },
  "claims.outcomes": {
    query: {
      measures: ["CLAIM_LIFECYCLE.TOTAL_CLAIMS", "CLAIM_LIFECYCLE.DECIDED_CLAIMS", "CLAIM_LIFECYCLE.APPROVED_CLAIMS", "CLAIM_LIFECYCLE.AWARD_RATE", "CLAIM_LIFECYCLE.DENIAL_RATE"],
      segments: ["CLAIM_LIFECYCLE.DECIDED"], limit: 10, timezone: "UTC",
    },
  },
  "claimant.masked": {
    query: {
      dimensions: ["CLAIMANT.CLAIMANT_ID", "CLAIMANT.FULL_NAME", "CLAIMANT.SSN", "CLAIMANT.EMAIL", "CLAIMANT.PHONE", "CLAIMANT.STATE_CODE"],
      limit: 10, timezone: "UTC",
    },
  },
  "checklist.base": {
    query: {
      dimensions: ["BUNDLE_CHECKLIST.CHECKLIST_CODE", "BUNDLE_CHECKLIST.STAGE_INDEX", "BUNDLE_CHECKLIST.DEVELOPMENT_STAGE", "BUNDLE_CHECKLIST.EXPECTED_DOC_TYPE", "BUNDLE_CHECKLIST.IS_REQUIRED"],
      limit: 50, timezone: "UTC",
    },
  },
  "evidence.bySource": {
    query: {
      measures: ["EVIDENCE.TOTAL_EVIDENCE", "EVIDENCE.RECEIVED_COUNT", "EVIDENCE.OVERDUE_COUNT", "EVIDENCE.AVG_IDP_CONFIDENCE"],
      dimensions: ["EVIDENCE.EVIDENCE_SOURCE_TYPE"], limit: 50, timezone: "UTC",
    },
  },
  "byStage": {
    query: {
      measures: ["CLAIM_LIFECYCLE.TOTAL_CLAIMS"], dimensions: ["CLAIM_LIFECYCLE.CURRENT_BUNDLE_STAGE"], limit: 20, timezone: "UTC",
    },
  },
};

const names = Object.keys(QUERIES);
const results = await pool(names, 3, async (name) => {
  const t0 = Date.now();
  const r = await runQuery(QUERIES[name]);
  return { name, ms: Date.now() - t0, row_count: r.row_count ?? (r.rows?.length ?? 0), cols: r.cols, sample: r.rows?.slice(0, 2) };
});

console.log("\n============ SSA SMART CLAIMS QUERY PROBE ============\n");
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const res = results[i];
  if (res.status === "fulfilled") {
    const v = res.value;
    console.log(`✅ ${name.padEnd(20)} rows=${String(v.row_count).padStart(6)}  (${v.ms}ms)`);
    console.log(`     cols: ${JSON.stringify(v.cols)}`);
    console.log(`     sample: ${JSON.stringify(v.sample)}`);
  } else {
    console.log(`❌ ${name.padEnd(20)} ERROR: ${res.reason?.message ?? res.reason}`);
  }
}
console.log("\n=====================================================\n");
