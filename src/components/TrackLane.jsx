import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { engine } from "../audio/engine.js";
import { player } from "../audio/player.js";
import { takePeaks } from "../audio/waveform.js";
import { palette } from "../theme.js";
import { formatDuration, useAnimationFrame, useDevices, useEngineState } from "../hooks.js";
import { IconMonitor } from "./Icons.jsx";

const HEADER_W = 208;
const RULER_H = 24;
const MAX_PPS = 1000; // deepest zoom: 1 ms per pixel (matches waveform peak resolution)
const ZOOM_STEP = 1.5;
const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/**
 * One-track project view.
 * Click/drag the ruler or lane to place the cursor · Ctrl+wheel zoom · wheel scroll · H/G zoom · F fit.
 */
export default function TrackLane({ take }) {
  const state = useEngineState();
  const { inputs } = useDevices();
  const [audio, setAudio] = useState(null); // { peaks, rate, duration }
  const [zoom, setZoom] = useState(1); // 1 = whole take fits the view
  const [viewW, setViewW] = useState(800);
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const live = useRef([]);
  const pendingScroll = useRef(null);

  const recording = state.recording;
  const duration = audio?.duration || (take ? take.duration_ms / 1000 : 0);
  const fitPps = viewW / Math.max(duration, 0.5);
  const maxZoom = Math.max(1, MAX_PPS / fitPps);
  const z = Math.min(zoom, maxZoom);
  const pps = fitPps * z;
  const contentW = recording || !take ? viewW : Math.max(viewW, Math.ceil(duration * pps));
  const view = useRef({});
  view.current = { pps, z, maxZoom, fitPps, duration, take, recording };

  // Decode the selected take's waveform.
  useEffect(() => {
    setAudio(null);
    if (!take) return;
    let alive = true;
    takePeaks(take)
      .then((a) => alive && setAudio(a))
      .catch(() => alive && setAudio(null));
    return () => {
      alive = false;
    };
  }, [take?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // New take → fit to view.
  useEffect(() => {
    setZoom(1);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [take?.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the time under the zoom anchor fixed: scroll is applied after the wider content renders.
  useLayoutEffect(() => {
    if (pendingScroll.current != null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [pps]);

  useEffect(() => {
    if (recording) live.current = [];
  }, [recording]);

  /** Zoom by `factor`, keeping the time at `anchorX` (px inside the view) in place. */
  const zoomBy = useCallback((factor, anchorX) => {
    const { pps, z, maxZoom, fitPps, take, recording } = view.current;
    const el = scrollRef.current;
    if (!el || !take || recording) return;
    const nz = Math.max(1, Math.min(maxZoom, z * factor));
    if (nz === z) return;
    if (anchorX == null) {
      // Anchor on the cursor if it's visible, otherwise on the centre.
      const cx = player.positionFor(take.id) * pps - el.scrollLeft;
      anchorX = cx >= 0 && cx <= el.clientWidth ? cx : el.clientWidth / 2;
    }
    const t = (el.scrollLeft + anchorX) / pps;
    pendingScroll.current = Math.max(0, t * fitPps * nz - anchorX);
    setZoom(nz);
  }, []);

  const fit = useCallback(() => {
    setZoom(1);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, []);

  // Wheel: Ctrl = zoom at the mouse, otherwise horizontal scroll. Needs a non-passive listener.
  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e) => {
      if (view.current.recording) return;
      if (e.ctrlKey) {
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - el.getBoundingClientRect().left);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Keys (Cubase-style): H zoom in · G zoom out · F fit.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, select, textarea") || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "h") zoomBy(ZOOM_STEP);
      else if (k === "g") zoomBy(1 / ZOOM_STEP);
      else if (k === "f") fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, fit]);

  // Click / drag to place the cursor (seeks immediately while playing).
  const seekAt = (e) => {
    const { pps, duration, take } = view.current;
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    const sec = (e.clientX - r.left + el.scrollLeft) / pps;
    player.seek(Math.max(0, Math.min(duration, sec)), take.id);
  };
  const onPointerDown = (e) => {
    const el = scrollRef.current;
    if (!take || recording || e.button !== 0) return;
    if (e.clientY - el.getBoundingClientRect().top > el.clientHeight) return; // on the scrollbar
    el.setPointerCapture(e.pointerId);
    seekAt(e);
  };
  const onPointerMove = (e) => {
    if (e.buttons & 1 && scrollRef.current.hasPointerCapture(e.pointerId)) seekAt(e);
  };

  useAnimationFrame(() => {
    const el = scrollRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const g = setupCanvas(cv, W, H);

    if (recording) {
      const [lo, hi] = engine.minMax();
      live.current.push(lo, hi);
      const elapsed = engine.recordingElapsed();
      const win = Math.max(30, Math.ceil((elapsed + 5) / 30) * 30);
      drawLane(g, {
        W,
        H,
        t0: 0,
        pps: W / win,
        total: win,
        clipEnd: elapsed,
        name: "Recording…",
        rec: true,
        peaks: live.current,
        rate: live.current.length / 2 / Math.max(elapsed, 0.001),
        cursor: elapsed,
      });
      return;
    }

    if (!take) {
      drawLane(g, { W, H, t0: 0, pps: 1, total: 0, hint: "กด R เพื่ออัด · M เพื่อฟังสด" });
      return;
    }

    const { pps, duration } = view.current;
    const pos = player.positionFor(take.id);
    // Follow the playhead while playing (page-style, like a DAW).
    if (player.state.playingId === take.id) {
      const x = pos * pps - el.scrollLeft;
      if (x > W * 0.92 || x < 0) el.scrollLeft = Math.max(0, pos * pps - W * 0.08);
    }
    drawLane(g, {
      W,
      H,
      t0: el.scrollLeft / pps,
      pps,
      total: duration,
      clipEnd: duration,
      name: take.name,
      peaks: audio?.peaks,
      rate: audio?.rate,
      cursor: pos,
    });
  });

  const inputName = inputs.find((d) => d.id === engine.settings.inputId)?.label ?? "Default input";

  return (
    <section className="flex min-h-0 min-w-0 overflow-hidden bg-base">
      {/* track header column */}
      <div style={{ width: HEADER_W }} className="flex shrink-0 flex-col border-r border-edge bg-panel">
        <div className="pane-title shrink-0 justify-between pr-1">
          <span>Project</span>
          <span className="flex items-center gap-0.5 normal-case">
            <ZoomBtn title="ซูมออก (G)" disabled={!take || recording || z <= 1} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              −
            </ZoomBtn>
            <ZoomBtn title="ซูมเข้า (H) · Ctrl+ล้อเมาส์" disabled={!take || recording || z >= maxZoom} onClick={() => zoomBy(ZOOM_STEP)}>
              +
            </ZoomBtn>
            <ZoomBtn title="พอดีจอ (F)" disabled={!take || recording || z <= 1} onClick={fit} wide>
              Fit
            </ZoomBtn>
          </span>
        </div>
        <div className="flex min-h-0 flex-1">
          <span className="w-1 bg-accent" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Guitar</span>
              <span className="ml-auto flex gap-1">
                <HdrBtn on={state.monitoring} onCls="bg-mon text-[#16161a]" title="ฟังสด (M)" onClick={() => engine.setMonitoring(!state.monitoring)}>
                  <IconMonitor className="size-3" />
                </HdrBtn>
                <HdrBtn on={recording} onCls="bg-rec text-white" title="สถานะอัด">
                  <span className="size-2 rounded-full bg-current" />
                </HdrBtn>
              </span>
            </div>
            <div className="truncate text-[10px] text-dim" title={inputName}>
              ← {inputName}
            </div>
            <div className="mt-auto space-y-0.5 font-mono text-[10px] text-faint">
              {take && !recording && (
                <>
                  <div className="truncate">
                    {take.name} · {formatDuration(take.duration_ms)}
                  </div>
                  <div>Zoom ×{z < 10 ? z.toFixed(1) : Math.round(z)}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* timeline: ruler + lane share one scroll position */}
      {/* The canvas is an overlay sized from the scroller (never part of its content), so the
          timeline width can't feed back into the page layout. The scroller only provides the scrollbar
          and pointer input over a transparent spacer as wide as the zoomed take. */}
      <div className="relative min-w-0 flex-1 overflow-hidden bg-well">
        <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0 block" />
        <div
          ref={scrollRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className={`absolute inset-0 overflow-x-auto overflow-y-hidden ${take && !recording ? "cursor-text" : ""}`}
        >
          <div style={{ width: contentW }} className="h-full" />
        </div>
      </div>
    </section>
  );
}

function setupCanvas(cv, W, H) {
  const dpr = window.devicePixelRatio || 1;
  // CSS size = the scroller's client area (excludes its scrollbar), so pixels map 1:1 and nothing stretches.
  if (cv.style.width !== `${W}px`) cv.style.width = `${W}px`;
  if (cv.style.height !== `${H}px`) cv.style.height = `${H}px`;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

function tickLabel(t, step) {
  if (step < 1) return `${t.toFixed(step < 0.1 ? 2 : 1)}s`;
  if (t >= 60) return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  return `${Math.round(t)}s`;
}

function drawLane(g, o) {
  const { W, H, t0, pps, total } = o;
  const P = palette;
  g.fillStyle = P.well;
  g.fillRect(0, 0, W, H);

  // ruler
  g.fillStyle = P.panel;
  g.fillRect(0, 0, W, RULER_H);
  g.fillStyle = P.edge;
  g.fillRect(0, RULER_H - 1, W, 1);

  if (o.hint) {
    g.fillStyle = P.dim;
    g.font = "11px 'Segoe UI', 'Leelawadee UI', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(o.hint, W / 2, (H + RULER_H) / 2);
    g.textAlign = "left";
    return;
  }

  if (total > 0) {
    const step = TICK_STEPS.find((s) => s * pps >= 90) ?? TICK_STEPS.at(-1);
    const minor = step / 5;
    const tEnd = Math.min(total, t0 + W / pps);
    g.font = "10px 'Cascadia Mono', Consolas, monospace";
    g.textBaseline = "middle";
    for (let k = Math.floor(t0 / minor); k * minor <= tEnd + 1e-9; k++) {
      const t = k * minor;
      const x = Math.round((t - t0) * pps);
      const major = k % 5 === 0;
      g.fillStyle = P.line;
      if (major) {
        g.fillRect(x, 4, 1, RULER_H - 5);
        g.fillStyle = P.dim;
        g.fillText(tickLabel(t, step), x + 4, 10);
        g.fillStyle = P.panel;
        g.fillRect(x, RULER_H, 1, H - RULER_H); // grid line in the lane
      } else {
        g.fillRect(x, RULER_H - 6, 1, 5);
      }
    }
  }

  // clip
  const top = RULER_H + 8;
  const bot = H - 8;
  const x0 = (0 - t0) * pps;
  const x1 = (o.clipEnd - t0) * pps;
  const cx0 = Math.max(x0, -2);
  const cx1 = Math.min(x1, W + 2);
  if (o.name && cx1 > cx0) {
    const body = o.rec ? P.rec : P["accent-soft"];
    g.globalAlpha = o.rec ? 0.12 : 0.45;
    g.fillStyle = body;
    g.fillRect(cx0, top, cx1 - cx0, bot - top);
    g.globalAlpha = 0.75;
    g.strokeStyle = o.rec ? P.rec : P.accent;
    g.strokeRect(Math.round(cx0) + 0.5, top + 0.5, Math.round(cx1 - cx0) - 1, bot - top - 1);
    g.globalAlpha = 1;
    g.fillStyle = body;
    g.fillRect(cx0, top, cx1 - cx0, 16);
    g.fillStyle = o.rec ? "#ffffff" : P.text;
    g.font = "11px 'Segoe UI', sans-serif";
    g.textBaseline = "middle";
    g.save();
    g.beginPath();
    g.rect(cx0, top, cx1 - cx0, 16);
    g.clip();
    g.fillText(o.name, Math.max(x0, 0) + 6, top + 8);
    g.restore();

    // waveform
    const wTop = top + 17;
    const mid = Math.round((wTop + bot) / 2);
    const amp = ((bot - wTop) / 2) * 0.92;
    g.fillStyle = P.line;
    g.fillRect(cx0, mid, cx1 - cx0, 1);
    const peaks = o.peaks;
    if (peaks && o.rate) {
      const n = peaks.length / 2;
      g.fillStyle = o.rec ? P["wave-rec"] : P.wave;
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const a = Math.floor((t0 + x / pps) * o.rate);
        if (a >= n) break;
        const b = Math.min(n, Math.max(a + 1, Math.floor((t0 + (x + 1) / pps) * o.rate)));
        let lo = 0;
        let hi = 0;
        for (let i = a; i < b; i++) {
          if (peaks[i * 2] < lo) lo = peaks[i * 2];
          if (peaks[i * 2 + 1] > hi) hi = peaks[i * 2 + 1];
        }
        const y = mid - hi * amp;
        g.fillRect(x, y, 1, Math.max(1, (hi - lo) * amp));
      }
    }
  }

  // cursor / playhead
  if (o.cursor != null) {
    const x = Math.round((o.cursor - t0) * pps);
    if (x >= -6 && x <= W + 6) {
      g.fillStyle = o.rec ? P.rec : P.text;
      g.fillRect(x, 0, 1, H);
      g.beginPath();
      g.moveTo(x - 5, RULER_H - 9);
      g.lineTo(x + 6, RULER_H - 9);
      g.lineTo(x + 0.5, RULER_H - 1);
      g.closePath();
      g.fill();
    }
  }
}

function ZoomBtn({ children, wide, ...props }) {
  return (
    <button
      {...props}
      className={`grid h-4 place-items-center rounded-[2px] border border-line bg-raised text-[10px] leading-none font-semibold text-text hover:bg-hover disabled:opacity-35 ${
        wide ? "px-1.5" : "w-4"
      }`}
    >
      {children}
    </button>
  );
}

function HdrBtn({ on, onCls, children, ...props }) {
  return (
    <button {...props} className={`grid size-5 place-items-center rounded-[2px] border border-line ${on ? onCls : "bg-raised text-dim hover:text-text"}`}>
      {children}
    </button>
  );
}
