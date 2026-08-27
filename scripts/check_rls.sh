#!/usr/bin/env bash
# Quick RLS check against the SSA Smart Claims semantic API.
# Usage: TOKEN="<access_token>" ./check_rls.sh
set -euo pipefail

BASE="https://leidos-sandbox.instance.dataos.cloud/vulcan/tenants/onboarding/data-products/onboarding-ssa-claims-prod"
TOKEN="${TOKEN:?Set TOKEN env var to your OIDC access_token}"

run_query () {
  local label="$1" query="$2"
  echo "───────────────────────────────────────────────"
  echo "▶ $label"
  # 1) submit
  local submit id status
  submit=$(curl -sS -X POST "$BASE/api/v1/query/semantic/rest" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\": $query}")
  id=$(echo "$submit" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)
  if [ -z "$id" ]; then echo "submit response: $submit"; return 1; fi
  # 2) poll
  status=""
  for _ in $(seq 1 40); do
    sleep 1.5
    status=$(curl -sS "$BASE/api/v1/query/statement/$id" -H "Authorization: Bearer $TOKEN" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)
    [ "$status" = "SUCCESS" ] && break
    [ "$status" = "FAILED" ] && { echo "query FAILED"; return 1; }
  done
  # 3) result
  curl -sS "$BASE/api/v1/query/statement/$id/result?format=json" -H "Authorization: Bearer $TOKEN" \
    | python3 -m json.tool
}

run_query "Distinct states visible in CLAIM_LIFECYCLE (should be ONLY CA)" \
  '{"dimensions":["CLAIM_LIFECYCLE.STATE_CODE"],"limit":100}'

run_query "Is CLAIM-00006 visible? (should be EMPTY if it is non-CA)" \
  '{"dimensions":["CLAIM_LIFECYCLE.CLAIM_ID","CLAIM_LIFECYCLE.STATE_CODE"],"filters":[{"member":"CLAIM_LIFECYCLE.CLAIM_ID","operator":"equals","values":["CLAIM-00006"]}]}'
