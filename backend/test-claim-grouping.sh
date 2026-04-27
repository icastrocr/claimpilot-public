#!/bin/bash
#
# Smoke test for claim grouping endpoints.
# Usage: ./test-claim-grouping.sh
#
# Prerequisites:
#   1. Backend running on localhost:4000
#   2. A valid JWT token (log in via the UI and copy from localStorage)
#
# Set your token:
#   export TOKEN="your-jwt-token-here"

set -e

BASE_URL="http://localhost:4000/api/v1"

if [ -z "$TOKEN" ]; then
  echo "⚠️  No TOKEN set. Attempting login with test credentials..."
  echo "   Set TOKEN env var to skip login, e.g.: export TOKEN=your-jwt"
  echo ""

  # Try to login with common dev credentials
  LOGIN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"password123"}' 2>/dev/null)

  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('accessToken',''))" 2>/dev/null || echo "")

  if [ -z "$TOKEN" ]; then
    echo "❌ Could not auto-login. Set TOKEN manually:"
    echo "   export TOKEN=\$(curl -s -X POST $BASE_URL/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASS\"}' | python3 -c \"import sys,json; print(json.load(sys.stdin)['data']['accessToken'])\")"
    exit 1
  fi
  echo "✅ Logged in successfully"
  echo ""
fi

AUTH="Authorization: Bearer $TOKEN"

echo "═══════════════════════════════════════════════════"
echo "  Claim Grouping Engine — Smoke Tests"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Test 1: Preview with no filters (should fail validation) ──
echo "── Test 1: Preview with no filters (expect 400) ──"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/claims/group-preview" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{}')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ Correctly rejected empty filters (400)"
else
  echo "❌ Expected 400, got $HTTP_CODE"
  echo "   $BODY"
fi
echo ""

# ── Test 2: Preview with a date range (should return groups) ──
echo "── Test 2: Preview with date range ──"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/claims/group-preview" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"2024-01-01","dateTo":"2026-12-31"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  TOTAL_GROUPS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['totalGroups'])" 2>/dev/null || echo "?")
  TOTAL_SERVICES=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['totalServices'])" 2>/dev/null || echo "?")
  VALID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['validGroups'])" 2>/dev/null || echo "?")
  INVALID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['invalidGroups'])" 2>/dev/null || echo "?")
  BILLED=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['totalBilled'])" 2>/dev/null || echo "?")

  echo "✅ Preview returned successfully (200)"
  echo "   Groups: $TOTAL_GROUPS (valid: $VALID, blocked: $INVALID)"
  echo "   Services: $TOTAL_SERVICES"
  echo "   Total billed: \$$BILLED"

  if [ "$TOTAL_SERVICES" = "0" ]; then
    echo ""
    echo "   ℹ️  No unsubmitted services found."
    echo "   Import a superbill first to test with real data."
  fi
else
  echo "❌ Expected 200, got $HTTP_CODE"
  echo "   $BODY"
fi
echo ""

# ── Test 3: Generate with no services (should fail or create 0) ──
echo "── Test 3: Preview with narrow date range (no services expected) ──"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/claims/group-preview" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"1990-01-01","dateTo":"1990-01-02"}')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  TOTAL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['summary']['totalServices'])" 2>/dev/null || echo "?")
  if [ "$TOTAL" = "0" ]; then
    echo "✅ Correctly returned 0 services for empty date range"
  else
    echo "⚠️  Unexpectedly found $TOTAL services in 1990"
  fi
else
  echo "❌ Expected 200, got $HTTP_CODE"
fi
echo ""

# ── Test 4: Generate (only run if there are valid groups) ──
echo "── Test 4: Generate claims (dry-run check) ──"
echo "   ⚠️  Skipping auto-generate to avoid creating test data."
echo "   To test generation manually:"
echo ""
echo "   curl -X POST $BASE_URL/claims/generate \\"
echo "     -H '$AUTH' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"dateFrom\":\"2024-01-01\",\"dateTo\":\"2026-12-31\"}'"
echo ""

echo "═══════════════════════════════════════════════════"
echo "  Tests complete"
echo "═══════════════════════════════════════════════════"
