#!/usr/bin/env bash
# OMC AI Tools · P1.1 · real-inference end-to-end, production path.
#
# This is NOT the rehearsal. Three processes, three different keys, nobody in
# the middle:
#
#   scheduler.js     resident, deployer key   -> assign + confirmDelivery + settle
#   node-worker.js   resident, node key       -> REAL Real-ESRGAN on the GPU
#   request-job.js   one shot,  requester key -> createJob, then only watches
#
# The sandbox blocks a node process from spawning another node process
# (spawnSync node.exe EBUSY), so the shell sequences them and each writes its
# own log. parse-evidence.js reads the three afterwards.
#
#   bash p1-service/evidence/capture-run-real.sh [image] [price]
#
# Defaults: testdata/sample_big.png (760x456 -> 12 tiles) and 5 tOMC.
set -u

cd "$(dirname "$0")/../.." || exit 1

# Resolve node at runtime. Hardcoding a version directory silently breaks the
# moment the platform swaps the managed build underneath us (it has happened:
# 22.22.2-3 -> 22.22.2-6), and the failure mode is "no output", not an error.
NODE="$(ls -d "C:/Users/Administrator/.workbuddy/binaries/node/versions/"*/node.exe 2>/dev/null | sort -V | tail -1)"
if [ -z "$NODE" ]; then echo "no managed node.exe found" >&2; exit 1; fi
export NODE_PATH="C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules"

IMAGE="${1:-testdata/sample_big.png}"
PRICE="${2:-5}"
STAMP="$(date +%Y%m%d-%H%M%S)"
D="p1-service/evidence"
OUT_SCH="$D/real-${STAMP}-scheduler.log"
OUT_WRK="$D/real-${STAMP}-worker.log"
OUT_REQ="$D/real-${STAMP}-request.log"
mkdir -p "$D"

echo "[capture] node=$NODE"
echo "[capture] image=$IMAGE price=$PRICE stamp=$STAMP"

# --- 1. resident scheduler (deployer key) -----------------------------------
"$NODE" p1-service/scheduler.js > "$OUT_SCH" 2>&1 &
SCH=$!

# --- 2. resident node worker (node key, real inference) ---------------------
"$NODE" p1-service/node-worker.js > "$OUT_WRK" 2>&1 &
WRK=$!

cleanup() { kill "$SCH" "$WRK" 2>/dev/null; wait "$SCH" "$WRK" 2>/dev/null; }
trap cleanup EXIT INT TERM

# --- 3. wait until the worker has actually announced itself -----------------
# The scheduler refuses to assign to a node with no live process, so this gate
# is the difference between "ran" and "ran with the liveness guard satisfied".
# The registry is pretty-printed JSON, so match the key with optional spaces.
# NB: the script already cd'd into omc-ai-tools/, so this is a relative path.
LIVE=".p1-jobs/workers.json"
ok=0
for i in $(seq 1 40); do
  if [ -f "$LIVE" ] && grep -Eq '"role"[[:space:]]*:[[:space:]]*"node-worker"' "$LIVE" 2>/dev/null; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  echo "[capture] FATAL: worker never announced liveness; refusing to create a job" >&2
  tail -20 "$OUT_WRK" >&2
  exit 1
fi
echo "[capture] liveness confirmed after ${i}s — creating the job"

# --- 4. requester: one createJob, then watch only ---------------------------
"$NODE" p1-service/request-job.js --image "$IMAGE" --price "$PRICE" > "$OUT_REQ" 2>&1
RC=$?

# Give the two resident processes a moment to flush their final lines.
sleep 3
cleanup
trap - EXIT INT TERM

echo "[capture] request-job exit=$RC"
echo "$OUT_REQ"
