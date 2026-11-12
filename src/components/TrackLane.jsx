import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { engine } from "../audio/engine.js";
import { player } from "../audio/player.js";
import { drawPeaks, takePeaks } from "../audio/waveform.js";
import { palette } from "../theme.js";
import { formatDuration, useAnimationFrame, useDevices, useEngineState, usePlayerState } from "../hooks.js";
import { IconMonitor } from "./Icons.jsx";

const HEADER_W = 208;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** One-track project view: shows the selected take, or the take being recorded live. */
export default function TrackLane({ take, settings }) {
  const state = useEngineState();
  const { playingId } = usePlayerState();
  const { inputs } = useDevices();
  const [decoded, setDecoded] = useState(null);
  const [liveWindow, setLiveWindow] = useState(30);
  const [laneW, setLaneW] = useState(800);
  const laneRef = useRef(null);
  const canvasRef = useRef(null);
  const playheadRef = useRef(null);
  const clipRef = useRef(null);
  const live = useRef([]);

  // Decode the selected take for its waveform.
  useEffect(() => {
    setDecoded(null);
    if (!take) return;
    let alive = true;
    takePeaks(take)
      .then((d) => alive && setDecoded(d))
      .catch(() => alive && setDecoded({ peaks: new Float32Array(0), duration: take.duration_ms / 1000 }));
    return () => {
      alive = false;
    };
  }, [take?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = laneRef.current;
    const ro = new ResizeObserver(() => setLaneW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (state.recording) {
      live.current = [];
      setLiveWindow(30);
    }
  }, [state.recording]);

  const duration = state.recording ? liveWindow : decoded?.duration || (take ? take.duration_ms / 1000 : 0);

  // Static waveform of the selected take.
  useEffect(() => {
    if (state.recording || !canvasRef.current) return;
    drawPeaks(canvasRef.current, decoded?.peaks ?? new Float32Array(0), { color: palette.wave });
  }, [decoded, laneW, state.recording, settings.theme]);

  // Live waveform while recording + playhead while playing.
  useAnimationFrame(() => {
    if (state.recording && canvasRef.current) {
      const [lo, hi] = engine.minMax();
      live.current.push(lo, hi);
      const elapsed = engine.recordingElapsed();
      const win = Math.max(30, Math.ceil((elapsed + 5) / 30) * 30);
      if (win !== liveWindow) setLiveWindow(win);
      drawPeaks(canvasRef.current, live.current, { color: palette["wave-rec"], fill: elapsed / win });
      if (clipRef.current) clipRef.current.style.width = `${(elapsed / win) * 100}%`;
    }
    if (playheadRef.current) {
      const on = take && playingId === take.id && duration > 0;
      playheadRef.current.style.display = on ? "block" : "none";
      if (on) playheadRef.current.style.left = `${(player.position() / duration) * 100}%`;
    }
  });

  const inputName = inputs.find((d) => d.id === settings.inputId)?.label ?? "Default input";
  const clipName = state.recording ? "Recording…" : take?.name;

  return (
    <section className="flex min-h-0 flex-col bg-base">
      {/* ruler row */}
      <div className="flex h-6 shrink-0 border-b border-edge bg-panel">
        <div style={{ width: HEADER_W }} className="pane-title shrink-0 border-r border-b-0 border-edge">
          Project
        </div>
        <Ruler duration={duration} width={laneW} />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* track header */}
        <div style={{ width: HEADER_W }} className="flex shrink-0 flex-col border-r border-edge bg-panel">
          <div className="flex h-full border-b border-edge">
            <span className="w-1 bg-accent" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Guitar</span>
                <span className="ml-auto flex gap-1">
                  <HdrBtn on={state.monitoring} onCls="bg-mon text-[#16161a]" title="ฟังสด (M)" onClick={() => engine.setMonitoring(!state.monitoring)}>
                    <IconMonitor className="size-3" />
                  </HdrBtn>
                  <HdrBtn on={state.recording} onCls="bg-rec text-white" title="สถานะอัด">
                    <span className="size-2 rounded-full bg-current" />
                  </HdrBtn>
                </span>
              </div>
              <div className="truncate text-[10px] text-dim" title={inputName}>
                ← {inputName}
              </div>
              <div className="mt-auto text-[10px] text-faint">
                {take && !state.recording ? `${take.name} · ${formatDuration(take.duration_ms)}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* lane */}
        <div ref={laneRef} className="relative min-w-0 flex-1 bg-well">
          <GridLines duration={duration} width={laneW} />
          {clipName ? (
            <div
              ref={clipRef}
              className={`absolute inset-y-2 left-0 overflow-hidden rounded-[2px] border ${
                state.recording ? "border-rec/70 bg-rec/10" : "border-accent/60 bg-accent-soft/40"
              }`}
              style={{ width: state.recording ? "0%" : "100%" }}
            >
              <div
                className={`h-4 truncate px-1.5 text-[10px] leading-4 ${
                  state.recording ? "bg-rec/70 text-white" : "bg-accent-soft text-text"
                }`}
              >
                {clipName}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[11px] text-faint">
              กด R เพื่ออัด · M เพื่อฟังสด
            </div>
          )}
          {/* waveform spans the whole lane; the clip box above frames the part that has audio */}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 top-[26px] h-[calc(100%-35px)] w-full" />
          <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 hidden w-px bg-text" />
        </div>
      </div>
    </section>
  );
}

function tickStep(duration, width) {
  const target = (duration / Math.max(1, width)) * 90; // ~90px between labels
  return TICK_STEPS.find((s) => s >= target) ?? TICK_STEPS.at(-1);
}

function Ruler({ duration, width }) {
  if (!duration) return <div className="flex-1" />;
  const step = tickStep(duration, width);
  const ticks = [];
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t);
  return (
    <div className="relative flex-1 overflow-hidden font-mono text-[10px] text-dim">
      {ticks.map((t) => (
        <div key={t} className="absolute inset-y-0 border-l border-line pl-1 leading-6" style={{ left: `${(t / duration) * 100}%` }}>
          {t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${+t.toFixed(1)}s`}
        </div>
      ))}
    </div>
  );
}

function GridLines({ duration, width }) {
  if (!duration) return null;
  const step = tickStep(duration, width);
  const lines = [];
  for (let t = step; t < duration; t += step) lines.push(t);
  return lines.map((t) => (
    <div key={t} className="absolute inset-y-0 w-px bg-panel" style={{ left: `${(t / duration) * 100}%` }} />
  ));
}

function HdrBtn({ on, onCls, children, ...props }) {
  return (
    <button {...props} className={`grid size-5 place-items-center rounded-[2px] border border-line ${on ? onCls : "bg-raised text-dim hover:text-text"}`}>
      {children}
    </button>
  );
}
