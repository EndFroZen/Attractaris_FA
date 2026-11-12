import { useEffect, useRef, useState } from "react";
import { engine } from "../audio/engine.js";
import { STANDARD_TUNING, centsBetween, detectPitch, median, nearestNote } from "../audio/pitch.js";
import { useEngineState } from "../hooks.js";

const IN_TUNE_CENTS = 5;

export default function TunerPanel() {
  const [target, setTarget] = useState("auto");
  const freq = usePitch();
  const { open, error } = useEngineState();
  const failed = !open && !!error; // open attempts clear the error first, so this means the last attempt failed

  const ref = target === "auto" ? freq && nearestNote(freq) : STANDARD_TUNING.find((s) => s.string === target);
  const cents = freq && ref ? centsBetween(freq, ref.freq) : null;
  const ok = cents != null && Math.abs(cents) <= IN_TUNE_CENTS;
  const showNote = ref && (freq || target !== "auto");

  return (
    <div className="grid h-full grid-cols-[168px_1fr]">
      {/* string list */}
      <div className="overflow-y-auto border-r border-edge bg-panel">
        <StringRow active={target === "auto"} onClick={() => setTarget("auto")} name="Auto" detail="Chromatic" />
        {STANDARD_TUNING.map((s) => (
          <StringRow
            key={s.string}
            active={target === s.string}
            onClick={() => setTarget(s.string)}
            name={`${s.string}  ${s.name}${s.octave}`}
            detail={`${s.freq.toFixed(2)} Hz`}
          />
        ))}
      </div>

      {/* readout */}
      <div className="flex min-w-0 flex-col justify-center gap-5 px-10 py-4">
        <div className="flex items-end gap-6">
          <div className={`w-28 font-mono text-[64px] leading-none font-semibold ${ok ? "text-accent" : "text-text"}`}>
            {showNote ? ref.name : "—"}
            {showNote && <span className="text-[22px] text-dim">{ref.octave}</span>}
          </div>
          <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 pb-1 font-mono text-[11px]">
            <span className="text-dim">Input</span>
            <span className="tabular-nums">{freq ? `${freq.toFixed(2)} Hz` : "—"}</span>
            <span className="text-dim">Target</span>
            <span className="tabular-nums">{ref ? `${ref.freq.toFixed(2)} Hz` : "—"}</span>
            <span className="text-dim">Offset</span>
            <span className={`tabular-nums ${ok ? "text-accent" : ""}`}>
              {cents != null ? `${cents > 0 ? "+" : ""}${cents.toFixed(1)} ¢` : "—"}
            </span>
          </div>
        </div>

        <CentsScale cents={cents} ok={ok} />

        <div className="h-4 text-[12px]">
          {failed ? (
            <span className="flex items-center gap-3">
              <span className="text-rec">เปิดอินพุตไม่ได้: {error}</span>
              <button className="ctl" onClick={() => engine.setTuning(true)}>
                ลองใหม่
              </button>
            </span>
          ) : !open ? (
            <span className="text-dim">กำลังเปิดอินพุต…</span>
          ) : cents == null ? (
            <span className="text-dim">{target === "auto" ? "ดีดทีละสาย" : `ดีดสาย ${target}`}</span>
          ) : ok ? (
            <span className="font-semibold text-accent">ตรงแล้ว</span>
          ) : cents < 0 ? (
            <span>
              ต่ำไป {Math.round(-cents)} cent — <b>ขันสายให้ตึงขึ้น</b>
              {cents < -100 && <span className="text-dim"> (ห่างมาก)</span>}
            </span>
          ) : (
            <span>
              สูงไป {Math.round(cents)} cent — <b>คลายสายลง</b>
              {cents > 100 && <span className="text-dim"> (ห่างมาก)</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Runs the tuner while mounted; returns the smoothed frequency or null. */
function usePitch() {
  const [freq, setFreq] = useState(null);
  const recent = useRef([]);
  const lastAt = useRef(0);
  useEffect(() => {
    engine.setTuning(true);
    const t = setInterval(() => {
      const s = engine.tunerSamples();
      const f = s && detectPitch(s.buf, s.sampleRate);
      const now = performance.now();
      if (f) {
        recent.current.push(f);
        if (recent.current.length > 5) recent.current.shift();
        lastAt.current = now;
        setFreq(median(recent.current));
      } else if (now - lastAt.current > 1500) {
        recent.current = [];
        setFreq(null);
      }
    }, 80); // ~12 readings/s is plenty for a tuner and keeps the main thread free for meters
    return () => {
      clearInterval(t);
      engine.setTuning(false);
    };
  }, []);
  return freq;
}

function StringRow({ active, onClick, name, detail }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 w-full items-center justify-between border-b border-edge px-3 text-left ${
        active ? "bg-accent-soft text-text" : "text-dim hover:bg-hover hover:text-text"
      }`}
    >
      <span className="font-mono text-[12px] whitespace-pre">{name}</span>
      <span className="font-mono text-[10px] opacity-70">{detail}</span>
    </button>
  );
}

function CentsScale({ cents, ok }) {
  const has = cents != null;
  const pos = has ? 50 + Math.max(-50, Math.min(50, cents)) : 50;
  const ticks = Array.from({ length: 21 }, (_, i) => -50 + i * 5);
  return (
    <div className="w-full max-w-3xl">
      <div className="relative h-12 rounded-[3px] border border-edge bg-well">
        {/* in-tune window */}
        <div
          className={`absolute inset-y-0 ${ok ? "bg-accent/30" : "bg-accent-soft/50"}`}
          style={{ left: `${50 - IN_TUNE_CENTS}%`, width: `${IN_TUNE_CENTS * 2}%` }}
        />
        {ticks.map((c) => (
          <div
            key={c}
            className={`absolute bottom-0 w-px ${c === 0 ? "h-full bg-dim" : c % 10 === 0 ? "h-1/2 bg-line" : "h-1/4 bg-line"}`}
            style={{ left: `${50 + c}%` }}
          />
        ))}
        <div
          className={`absolute inset-y-1 w-[3px] -translate-x-1/2 rounded-[1px] transition-[left] duration-100 ${
            ok ? "bg-accent" : "bg-text"
          } ${has ? "" : "opacity-0"}`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="relative mt-1 h-3 font-mono text-[10px] text-dim">
        {[-50, -25, 0, 25, 50].map((c) => (
          <span key={c} className="absolute -translate-x-1/2" style={{ left: `${50 + c}%` }}>
            {c > 0 ? `+${c}` : c}
          </span>
        ))}
      </div>
    </div>
  );
}
