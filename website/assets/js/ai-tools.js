/* ============================================================
   OMC — /ai-tools controller

   Entirely client side. The inference runtime (onnxruntime-web) and
   the Real-ESRGAN ONNX weights are the only things fetched from the
   network; the user's image never leaves the tab.

   Design rules this file must not break:
     - zero bundler: plain script, loaded with <script src>
     - no wallet, no chain call, no token, no price
     - must survive an environment with no WebGPU and no fetch
       (the headless regression runs under jsdom, where neither
       exists) — every capability is probed, never assumed
   ============================================================ */
(function () {
  "use strict";

  /* ---- copy helper: falls back to the English default in the DOM ---- */
  function T(key, fallback) {
    try {
      var d = window.I18N && window.I18N[window.__lang || "en"];
      if (d && d[key]) return d[key];
      var e = window.I18N && window.I18N.en;
      if (e && e[key]) return e[key];
    } catch (err) { /* ignore */ }
    return fallback || key;
  }

  var ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js";
  var ORT_WASM_DIR = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
  var MODEL_URL = "assets/models/real_esrgan_x4.onnx";
  var SCALE = 4;
  var PAD = 16;
  var MAX_LONG_EDGE = 4096;

  var state = {
    file: null,
    img: null,           /* HTMLImageElement of the source */
    session: null,
    ep: "",              /* "webgpu" | "wasm" | "" */
    ortReady: false,
    ortLoading: false,
    outCanvas: null,
    busy: false
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function log(msg) {
    if (!el.log) return;
    var row = document.createElement("div");
    row.textContent = msg;
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    while (el.log.children.length > 60) el.log.removeChild(el.log.firstChild);
  }

  function setStat(node, text, cls) {
    if (!node) return;
    node.textContent = text;
    node.className = "v" + (cls ? " " + cls : "");
  }

  function fmtMs(ms) {
    if (ms < 1000) return Math.round(ms) + " ms";
    if (ms < 60000) return (ms / 1000).toFixed(1) + " s";
    return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
  }

  /* ---------------------------------------------------------------
     Capability probes. Never assume; a missing API must degrade to a
     clear message rather than an exception.
     --------------------------------------------------------------- */
  function hasWebGPU() {
    return !!(navigator && navigator.gpu && typeof navigator.gpu.requestAdapter === "function");
  }
  function hasFetch() {
    return typeof fetch === "function";
  }

  async function detectEp() {
    if (hasWebGPU()) {
      try {
        var adapter = await navigator.gpu.requestAdapter();
        if (adapter) return "webgpu";
      } catch (e) { /* fall through */ }
    }
    return "wasm";
  }

  /* ---------------------------------------------------------------
     Load onnxruntime-web from the CDN, once.
     --------------------------------------------------------------- */
  function loadOrt() {
    return new Promise(function (resolve, reject) {
      if (state.ortReady) return resolve();
      if (window.ort) { state.ortReady = true; return resolve(); }
      if (!hasFetch()) return reject(new Error("no fetch in this environment"));
      if (state.ortLoading) {
        var t = setInterval(function () {
          if (window.ort || state.ortReady) { clearInterval(t); resolve(); }
        }, 120);
        return;
      }
      state.ortLoading = true;
      var s = document.createElement("script");
      s.src = ORT_CDN;
      s.onload = function () {
        if (window.ort) {
          try { window.ort.env.wasm.wasmPaths = ORT_WASM_DIR; } catch (e) {}
          try { window.ort.env.wasm.numThreads = 1; } catch (e) {}
          state.ortReady = true;
          resolve();
        } else {
          reject(new Error("runtime script loaded but window.ort is undefined"));
        }
      };
      s.onerror = function () { reject(new Error("could not load the inference runtime")); };
      document.head.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------
     Prepare the model. This is the only heavy network step.
     --------------------------------------------------------------- */
  async function prepareModel() {
    if (state.session) { log(T("ai.log_model_ready", "Model already loaded.")); return; }
    if (state.busy) return;

    state.busy = true;
    el.prep.disabled = true;
    el.go.disabled = true;
    progress(0, true);
    log(T("ai.log_probing", "Checking what this browser can run ..."));

    try {
      state.ep = await detectEp();
      setStat(el.ep, state.ep === "webgpu" ? "WebGPU" : "WASM (CPU)", state.ep === "webgpu" ? "good" : "warn");
      log(T("ai.log_ep", "Runtime: ") + (state.ep === "webgpu" ? "WebGPU" : "WASM") );

      setStat(el.model, T("ai.m_loading", "loading runtime ..."), "warn");
      await loadOrt();

      setStat(el.model, T("ai.m_downloading", "downloading 64 MB ..."), "warn");
      log(T("ai.log_dl", "Fetching the model file ..."));
      var res = await fetch(MODEL_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error("model fetch failed: HTTP " + res.status);

      var total = 0;
      var buf = await readStream(res, function (done, all) {
        total = all;
        var pct = all ? Math.round((done / all) * 100) : 0;
        progress(pct, true);
        if (all) setStat(el.model, pct + "%", "warn");
      });

      setStat(el.model, T("ai.m_compiling", "compiling graph ..."), "warn");
      log(T("ai.log_compile", "Building the inference session (this takes a moment) ..."));

      var providers = state.ep === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
      state.session = await window.ort.InferenceSession.create(buf, {
        executionProviders: providers,
        graphOptimizationLevel: "all"
      });

      progress(100, true);
      setTimeout(function () { progress(0, false); }, 500);
      setStat(el.model, T("ai.m_ready", "ready"), "good");
      log(T("ai.log_ready", "Model ready.") );
      if (state.file) el.go.disabled = false;
    } catch (err) {
      progress(0, false);
      setStat(el.model, T("ai.m_failed", "failed"), "warn");
      log(T("ai.log_err", "Error: ") + (err && err.message ? err.message : String(err)));
      el.prep.disabled = false;
    } finally {
      state.busy = false;
      if (state.session && state.file) el.go.disabled = false;
    }
  }

  function readStream(res, onProgress) {
    if (res.body && typeof res.body.getReader === "function") {
      var len = Number(res.headers.get("content-length")) || 0;
      var reader = res.body.getReader();
      var chunks = [], received = 0;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var out = new Uint8Array(received);
            var off = 0;
            for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
            return out.buffer;
          }
          chunks.push(r.value);
          received += r.value.length;
          onProgress(received, len);
          return pump();
        });
      })();
    }
    return res.arrayBuffer();
  }

  function progress(pct, on) {
    if (!el.prog) return;
    el.prog.classList.toggle("on", !!on);
    if (el.progBar) el.progBar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  /* ---------------------------------------------------------------
     Image intake
     --------------------------------------------------------------- */
  function readFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      log(T("ai.log_notimg", "That file is not an image."));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var longEdge = Math.max(img.naturalWidth, img.naturalHeight);
      if (longEdge > MAX_LONG_EDGE) {
        log(T("ai.log_toobig", "Too large: ") + longEdge + " px. " + T("ai.log_toobig2", "The long edge must be under ") + MAX_LONG_EDGE + " px.");
        URL.revokeObjectURL(url);
        return;
      }
      state.file = file;
      state.img = img;
      setStat(el.in, img.naturalWidth + " × " + img.naturalHeight);
      setStat(el.out, Math.round(img.naturalWidth * SCALE) + " × " + Math.round(img.naturalHeight * SCALE));
      el.reset.disabled = false;
      el.go.disabled = !state.session;
      log(T("ai.log_picked", "Image selected: ") + file.name + " (" + img.naturalWidth + "×" + img.naturalHeight + ")");
      if (!state.session) log(T("ai.log_needmodel", "Prepare the model before upscaling."));
    };
    img.onerror = function () {
      log(T("ai.log_decode", "Could not decode that image."));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  /* ---------------------------------------------------------------
     The upscale itself: tile, infer, blend.
     This mirrors upscale.py — same normalisation (RGB, 0..1, NCHW),
     same tile/stride maths, same weighted averaging of the overlap.
     --------------------------------------------------------------- */
  function tileStarts(len, tile, stride) {
    var out = [];
    if (len <= tile) return [0];
    for (var p = 0; p + tile < len; p += stride) out.push(p);
    out.push(len - tile);
    return out;
  }

  async function upscale() {
    if (!state.session || !state.img || state.busy) return;
    state.busy = true;
    el.go.disabled = true;
    el.dl.disabled = true;
    el.prep.disabled = true;

    var t0 = performance.now();
    try {
      var src = state.img;
      var sw = src.naturalWidth, sh = src.naturalHeight;
      var tile = parseInt(el.tile.value, 10) || 256;
      var pad = PAD;
      var stride = Math.max(1, tile - pad * 2);

      /* source pixels */
      var c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      var cx = c.getContext("2d");
      cx.drawImage(src, 0, 0);
      var srcData = cx.getImageData(0, 0, sw, sh).data;

      var ow = sw * SCALE, oh = sh * SCALE;
      var out = document.createElement("canvas");
      out.width = ow; out.height = oh;
      var ocx = out.getContext("2d");
      var acc = new Float32Array(ow * oh * 3);
      var wsum = new Float32Array(ow * oh);

      var xs = tileStarts(sw, tile, stride);
      var ys = tileStarts(sh, tile, stride);
      var total = xs.length * ys.length;
      var doneN = 0;
      log(T("ai.log_tiles", "Tiles to process: ") + total + " (" + xs.length + " × " + ys.length + ")");

      for (var yi = 0; yi < ys.length; yi++) {
        for (var xi = 0; xi < xs.length; xi++) {
          var x0 = xs[xi], y0 = ys[yi];
          var tw = Math.min(tile, sw - x0), th = Math.min(tile, sh - y0);

          /* build the NCHW float tensor for this tile */
          var inp = new Float32Array(3 * th * tw);
          for (var yy = 0; yy < th; yy++) {
            for (var xx = 0; xx < tw; xx++) {
              var si = ((y0 + yy) * sw + (x0 + xx)) * 4;
              var di = yy * tw + xx;
              inp[0 * th * tw + di] = srcData[si] / 255;
              inp[1 * th * tw + di] = srcData[si + 1] / 255;
              inp[2 * th * tw + di] = srcData[si + 2] / 255;
            }
          }

          var tensor = new window.ort.Tensor("float32", inp, [1, 3, th, tw]);
          var inName = state.session.inputNames[0];
          var fetches = await state.session.run({ [inName]: tensor });
          var outName = state.session.outputNames[0] || Object.keys(fetches)[0];
          var od = fetches[outName];
          var oww = od.dims[3], ohh = od.dims[2];
          var plane = ohh * oww;
          var data = od.data;

          /* Crop the pad off, but never crop past the picture.
             upscale.py removes a flat `pad` from every side of every tile,
             which silently discards the outermost `pad*4` pixels of the whole
             image: no tile ever paints them, and the merge divides by a zero
             weight so they come out black. Here the pad on a side is only
             removed when that tile actually has a neighbour on that side.
             Col 0 of the grid keeps its left pad; the last column keeps its
             right pad; same for top/bottom. That is what makes the output
             cover every pixel of the image. */
          var firstY = (yi === 0), lastY = (yi === ys.length - 1);
          var firstX = (xi === 0), lastX = (xi === xs.length - 1);

          var topPad = firstY ? 0 : pad;
          var leftPad = firstX ? 0 : pad;
          /* bottom/right keep their pad unless this tile is short of full size
             (i.e. it is already the edge of the picture) or it is the last one */
          var botPad = lastY ? 0 : (tile - th + pad);
          var rightPad = lastX ? 0 : (tile - tw + pad);

          var oy0 = topPad * SCALE, oy1 = ohh - botPad * SCALE;
          var ox0 = leftPad * SCALE, ox1 = oww - rightPad * SCALE;
          if (oy1 <= oy0) { oy0 = 0; oy1 = ohh; }
          if (ox1 <= ox0) { ox0 = 0; ox1 = oww; }
          var ch = oy1 - oy0, cw = ox1 - ox0;

          var gy0 = y0 * SCALE + oy0, gx0 = x0 * SCALE + ox0;

          /* Feather only where there IS an overlap to hide. A side that sits
             on the image edge has no seam, so it gets a flat weight. */
          var fXa = firstX ? cw : Math.max(1, pad * SCALE);
          var fXb = lastX ? cw : Math.max(1, pad * SCALE);
          var fYa = firstY ? ch : Math.max(1, pad * SCALE);
          var fYb = lastY ? ch : Math.max(1, pad * SCALE);

          for (var ry = 0; ry < ch; ry++) {
            var oy = gy0 + ry;
            if (oy < 0 || oy >= oh) continue;
            /* weight ramps up from a feathered edge, flat on an image edge */
            var wt = firstY ? 1 : Math.min(1, ry / fYa);
            var wb = lastY ? 1 : Math.min(1, (ch - 1 - ry) / fYb);
            var wy = Math.min(wt, wb);
            for (var rx = 0; rx < cw; rx++) {
              var oxp = gx0 + rx;
              if (oxp < 0 || oxp >= ow) continue;
              var wl = firstX ? 1 : Math.min(1, rx / fXa);
              var wr = lastX ? 1 : Math.min(1, (cw - 1 - rx) / fXb);
              var wx = Math.min(wl, wr);
              var w = Math.max(1e-4, wx * wy);
              var sIdx = (oy0 + ry) * oww + (ox0 + rx);
              var oIdx = (oy * ow + oxp) * 3;
              var wIdx = oy * ow + oxp;
              acc[oIdx] += data[0 * plane + sIdx] * w;
              acc[oIdx + 1] += data[1 * plane + sIdx] * w;
              acc[oIdx + 2] += data[2 * plane + sIdx] * w;
              wsum[wIdx] += w;
            }
          }

          doneN++;
          var pct = Math.round((doneN / total) * 100);
          progress(pct, true);
          setStat(el.time, fmtMs(performance.now() - t0));

          /* yield so the UI can paint between tiles */
          await new Promise(function (r) { setTimeout(r, 0); });
        }
      }

      /* second pass: divide by the accumulated weight. Every pixel is
         touched by at least one tile, so wsum is never zero on a real
         output pixel; the guard is defensive only. */
      var imgOut = ocx.createImageData(ow, oh);
      var dst = imgOut.data;
      for (var i = 0; i < ow * oh; i++) {
        var w2 = wsum[i] || 1;
        dst[i * 4] = clamp8(acc[i * 3] / w2);
        dst[i * 4 + 1] = clamp8(acc[i * 3 + 1] / w2);
        dst[i * 4 + 2] = clamp8(acc[i * 3 + 2] / w2);
        dst[i * 4 + 3] = 255;
      }
      ocx.putImageData(imgOut, 0, 0);

      state.outCanvas = out;
      var ms = performance.now() - t0;
      setStat(el.time, fmtMs(ms), "good");
      setStat(el.out, ow + " × " + oh, "good");
      progress(0, false);
      log(T("ai.log_done", "Done in ") + fmtMs(ms) + " → " + ow + "×" + oh);

      showCompare(out);
      el.dl.disabled = false;
    } catch (err) {
      progress(0, false);
      log(T("ai.log_err", "Error: ") + (err && err.message ? err.message : String(err)));
    } finally {
      state.busy = false;
      el.prep.disabled = !!state.session;
      el.go.disabled = !state.session;
    }
  }

  function clamp8(v) {
    var n = Math.round(v);
    return n < 0 ? 0 : (n > 255 ? 255 : n);
  }

  /* ---------------------------------------------------------------
     Compare slider
     --------------------------------------------------------------- */
  function showCompare(canvas) {
    if (!el.cmp) return;
    var small = document.createElement("canvas");
    var maxW = 1100;
    var s = Math.min(1, maxW / canvas.width);
    small.width = Math.round(canvas.width * s);
    small.height = Math.round(canvas.height * s);
    small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
    var dataUrl = small.toDataURL("image/png");

    /* the "before" is the source shown at the same display size */
    var before = document.createElement("canvas");
    before.width = small.width; before.height = small.height;
    before.getContext("2d").drawImage(state.img, 0, 0, small.width, small.height);

    el.before.src = before.toDataURL("image/png");
    el.after.src = dataUrl;
    el.cmp.classList.add("on");
    setSplit(50);
  }

  function setSplit(pct) {
    if (!el.cmp) return;
    var shade = el.cmp.querySelector(".after");
    if (shade) shade.style.width = pct + "%";
    if (el.handle) el.handle.style.left = pct + "%";
  }

  function splitFromEvent(ev) {
    if (!el.cmp) return;
    var rect = el.cmp.getBoundingClientRect();
    var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    var pct = (x / rect.width) * 100;
    setSplit(Math.max(0, Math.min(100, pct)));
  }

  /* ---------------------------------------------------------------
     Download + reset
     --------------------------------------------------------------- */
  function download() {
    if (!state.outCanvas) return;
    var a = document.createElement("a");
    var base = (state.file && state.file.name ? state.file.name.replace(/\.[^.]+$/, "") : "image");
    a.download = base + "_omc_4x.png";
    a.href = state.outCanvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log(T("ai.log_saved", "Saved ") + a.download);
  }

  function reset() {
    state.file = null;
    state.img = null;
    state.outCanvas = null;
    if (el.file) el.file.value = "";
    if (el.cmp) el.cmp.classList.remove("on");
    setStat(el.in, "—");
    setStat(el.out, "—");
    setStat(el.time, "—");
    el.dl.disabled = true;
    el.reset.disabled = true;
    el.go.disabled = true;
    log(T("ai.log_reset", "Cleared. Pick a new image."));
  }

  /* ---------------------------------------------------------------
     Wiring
     --------------------------------------------------------------- */
  function init() {
    el = {
      drop: $("aiDrop"), file: $("aiFile"), tile: $("aiTile"),
      prep: $("aiPrep"), go: $("aiGo"), dl: $("aiDl"), reset: $("aiReset"),
      prog: $("aiProg"), progBar: $("aiProgBar"),
      ep: $("aiEp"), model: $("aiModel"), in: $("aiIn"), out: $("aiOut"), time: $("aiTime"),
      cmp: $("aiCmp"), before: $("aiBefore"), after: $("aiAfter"), handle: $("aiHandle"),
      log: $("aiLog")
    };
    if (!el.drop) return;

    /* the tool is inert until the user prepares it: say so up front */
    setStat(el.ep, "—"); setStat(el.model, T("ai.m_idle", "not loaded"), "warn");
    log(T("ai.log_hello", "This page runs the model on your own device. Press Prepare model to start."));
    if (!hasWebGPU()) log(T("ai.log_nowebgpu", "WebGPU is not available here — the model will run on the CPU through WebAssembly, which is slower."));

    el.drop.addEventListener("click", function () { el.file.click(); });
    el.file.addEventListener("change", function (e) { readFile(e.target.files && e.target.files[0]); });

    ["dragenter", "dragover"].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove("over"); });
    });
    el.drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });

    el.prep.addEventListener("click", prepareModel);
    el.go.addEventListener("click", upscale);
    el.dl.addEventListener("click", download);
    el.reset.addEventListener("click", reset);

    if (el.cmp) {
      var dragging = false;
      var start = function (e) { dragging = true; splitFromEvent(e); };
      var move = function (e) { if (dragging) { e.preventDefault(); splitFromEvent(e); } };
      var end = function () { dragging = false; };
      el.cmp.addEventListener("mousedown", start);
      el.cmp.addEventListener("touchstart", start, { passive: true });
      el.handle.addEventListener("mousedown", start);
      el.handle.addEventListener("touchstart", start, { passive: true });
      window.addEventListener("mousemove", move);
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("mouseup", end);
      window.addEventListener("touchend", end);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
