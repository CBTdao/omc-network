#!/usr/bin/env bash
# OMC AI Tools · P1 · drive the two rehearsals into one marked log.
#
# The sandbox blocks a node process from spawning another node process
# (spawnSync node.exe EBUSY), so the runs are sequenced here and parsed
# afterwards by capture-evidence.js.
#
#   bash p1-service/evidence/capture-run.sh [price]
#
# Writes p1-service/evidence/run-<stamp>.log and prints the path.
set -u

cd "$(dirname "$0")/../.." || exit 1

# Resolve node at runtime. Hardcoding a version directory silently breaks the
# moment the platform swaps the managed build underneath us (it has happened:
# 22.22.2-3 -> 22.22.2-6), and the failure mode is "no output", not an error.
NODE="$(ls -d "C:/Users/Administrator/.workbuddy/binaries/node/versions/"*/node.exe 2>/dev/null | sort -V | tail -1)"
if [ -z "$NODE" ]; then echo "no managed node.exe found" >&2; exit 1; fi
export NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules"

PRICE="${1:-5}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="p1-service/evidence/run-${STAMP}.log"
mkdir -p p1-service/evidence

printf '########## node-worker.js --once (heal heartbeat) ##########\n' > "$OUT"
"$NODE" p1-service/node-worker.js --once --no-infer >> "$OUT" 2>&1

printf '\n########## e2e-rehearsal.js (success path) ##########\n' >> "$OUT"
"$NODE" p1-service/e2e-rehearsal.js --no-infer --price "$PRICE" >> "$OUT" 2>&1

printf '\n########## e2e-failure.js (failure path) ##########\n' >> "$OUT"
"$NODE" p1-service/e2e-failure.js --price "$PRICE" >> "$OUT" 2>&1

printf '%s\n' "$OUT"
