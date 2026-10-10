/**
 * OMC AI Tools · P1 · out-of-band image store
 *
 * The part of the design people skip, and the part that decides whether the
 * whole thing is real.
 *
 * The chain cannot hold the image. An EVM word is 32 bytes; a photo is
 * hundreds of kilobytes, and putting it in calldata would cost more gas than
 * the job is worth. So the pixels move through an ordinary blob channel and
 * the chain keeps only their keccak256. That digest is the only reason the
 * off-chain hop is trustworthy:
 *
 *   requester computes  imageHash = keccak256(bytes)
 *                       specHash  = keccak256("omc-ai-tools/spec/v1|" + …)
 *   node      reads bytes, runs the model, computes
 *                       resultHash = keccak256(resultBytes)
 *   requester downloads the result and checks it hashes to resultHash
 *
 * A file whose bytes do not hash to the committed digest is, by definition,
 * not the agreed artefact. No trust in the transport is required — only in
 * keccak256.
 *
 * Layout (all local for now; swapping this for object storage later means
 * changing only the four path helpers below):
 *
 *   omc-ai-tools/.p1-jobs/<id>/spec.bin         the requester's input bytes
 *   omc-ai-tools/.p1-jobs/<id>/spec.meta.json   imageHash, specHash, tier, …
 *   omc-ai-tools/.p1-jobs/<id>/result.png       the node's output
 *   omc-ai-tools/.p1-jobs/<id>/result.meta.json resultHash, timing, …
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.resolve(__dirname, "..", ".p1-jobs");

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

function jobDir(id) { return path.join(ROOT, String(id)); }

function specPath(id) { return path.join(jobDir(id), "spec.bin"); }
function specMetaPath(id) { return path.join(jobDir(id), "spec.meta.json"); }
function resultPath(id) { return path.join(jobDir(id), "result.png"); }
function resultMetaPath(id) { return path.join(jobDir(id), "result.meta.json"); }

/** Digest of raw bytes. The single source of truth for both sides. */
function hashBytes(buf) { return ethers.keccak256(buf); }

/**
 * Fold the image digest together with the job parameters. Hashing the image
 * alone would let two jobs with the same picture but different tier or policy
 * collide onto one specHash, which would make the commitment ambiguous.
 */
function specHashFor(imageHash, tier, verifyPolicy, protection) {
  const pre = "omc-ai-tools/spec/v1|" + imageHash + "|" + tier + "|" +
    verifyPolicy + "|" + protection;
  return ethers.keccak256(ethers.toUtf8Bytes(pre));
}

/** Requester side: park the input bytes and the commitment next to each other. */
function putSpec(jobId, bytes, meta) {
  ensure(jobDir(jobId));
  fs.writeFileSync(specPath(jobId), bytes);
  const imageHash = hashBytes(bytes);
  const full = Object.assign({
    jobId: Number(jobId),
    imageHash,
    bytes: bytes.length,
    at: new Date().toISOString(),
  }, meta || {});
  fs.writeFileSync(specMetaPath(jobId), JSON.stringify(full, null, 2));
  return full;
}

function readSpecMeta(jobId) {
  const p = specMetaPath(jobId);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

function writeResultMeta(jobId, meta) {
  ensure(jobDir(jobId));
  fs.writeFileSync(resultMetaPath(jobId), JSON.stringify(meta, null, 2));
}

function readResultMeta(jobId) {
  const p = resultMetaPath(jobId);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/**
 * Verify a downloaded result against the digest the chain recorded. This is
 * the check the page runs and the check the scheduler runs before it is
 * willing to settle.
 */
function verifyResult(jobId) {
  if (!fs.existsSync(resultPath(jobId))) return { ok: false, error: "no result file" };
  const meta = readResultMeta(jobId);
  if (!meta || !meta.resultHash) return { ok: false, error: "no result meta" };
  const actual = hashBytes(fs.readFileSync(resultPath(jobId)));
  return {
    ok: actual.toLowerCase() === meta.resultHash.toLowerCase(),
    expected: meta.resultHash,
    actual,
    bytes: fs.statSync(resultPath(jobId)).size,
  };
}

module.exports = {
  ROOT, jobDir, specPath, specMetaPath, resultPath, resultMetaPath,
  hashBytes, specHashFor, putSpec, readSpecMeta,
  writeResultMeta, readResultMeta, verifyResult,
};
