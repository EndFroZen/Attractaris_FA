import { useRef } from "react";
import { engine } from "../audio/engine.js";
import { player } from "../audio/player.js";
import { formatClock, useAnimationFrame, useEngineState, usePlayerState } from "../hooks.js";
import { IconList, IconMonitor, IconMoon, IconPlay, IconRecord, IconStop, IconSun, IconTuner } from "./Icons.jsx";

export default function Transport({ onRecord, onPlay, canPlay, lowerTab, setLowerTab, theme, onToggleTheme }) {
  const state = useEngineState();
  const { playingId } = usePlayerState();
  const playing = playingId != null;
  const clockRef = useRef(null);

  useAnimationFrame(() => {
    if (!clockRef.current) return;
    const t = state.recording ? engine.recordingElapsed() : player.position();
    clockRef.current.textContent = formatClock(t);
  });

  const mode = state.recording ? "REC" : playing ? "PLAY" : "STOP";
  const sr = engine.sampleRate();

  return (
    <header className="flex h-12 items-center gap-3 bg-panel px-3">
      <div className="flex w-[248px] items-center gap-2">
        <img src="/logo.png" alt="" className="size-6" />
        <span className="text-[13px] font-semibold tracking-wide">Attractaris</span>
      </div>

      <div className="flex items-center gap-px rounded-[3px] border border-edge bg-edge">
        <TBtn title="หยุด (Space)" onClick={() => (engine.isRecordBusy() ? onRecord() : player.stop())}>
          <IconStop />
        </TBtn>
        <TBtn title="เล่นเทคที่เลือก (Space)" active={playing} disabled={!canPlay || state.recording} onClick={onPlay}>
          <IconPlay />
        </TBtn>
        <TBtn title="อัด (R)" onClick={onRecord} className={state.recording ? "bg-rec text-white hover:bg-rec" : "text-rec"}>
          <IconRecord />
        </TBtn>
      </div>

      <TBtn
        title="ฟังสด / Input monitoring (M)"
        onClick={() => engine.setMonitoring(!state.monitoring)}
        className={`rounded-[3px] border border-edge ${state.monitoring ? "bg-mon text-[#16161a] hover:bg-mon" : ""}`}
      >
        <IconMonitor />
      </TBtn>

      <div className="lcd flex h-9 items-center gap-3 px-3">
        <span
          className={`w-9 text-[10px] font-semibold ${
            mode === "REC" ? "text-rec" : mode === "PLAY" ? "text-accent" : "text-faint"
          }`}
        >
          {mode}
        </span>
        <span ref={clockRef} className="text-[20px] leading-none text-text">
          00:00.000
        </span>
      </div>

      <div className="lcd flex h-9 flex-col justify-center px-3 text-[10px] leading-4 text-dim">
        <span>{sr ? `${(sr / 1000).toFixed(1)} kHz` : "— kHz"}</span>
        <span>{state.open && state.latencyMs ? `${state.latencyMs} ms` : "— ms"}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button className={`ctl ${lowerTab === "takes" ? "ctl-on" : ""}`} onClick={() => setLowerTab("takes")} title="รายการเทค">
          <IconList /> Takes
        </button>
        <button className={`ctl ${lowerTab === "tuner" ? "ctl-on" : ""}`} onClick={() => setLowerTab("tuner")} title="จูนเนอร์ (T)">
          <IconTuner /> Tuner
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button
          className="ctl w-7 px-0"
          onClick={onToggleTheme}
          title={theme === "light" ? "สลับเป็นโหมดมืด" : "สลับเป็นโหมดสว่าง"}
        >
          {theme === "light" ? <IconMoon /> : <IconSun />}
        </button>
      </div>
    </header>
  );
}

function TBtn({ children, active, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`grid h-8 w-10 place-items-center bg-raised text-text hover:bg-hover disabled:opacity-35 ${
        active ? "bg-accent-soft text-accent" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}
