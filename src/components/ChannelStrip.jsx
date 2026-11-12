import { useRef, useState } from "react";
import { engine } from "../audio/engine.js";
import { formatDb, fromDb, toDb, useAnimationFrame, useEngineState } from "../hooks.js";
import { IconMonitor } from "./Icons.jsx";
import { palette } from "../theme.js";

const METER_FLOOR = -60;
const SCALE = [0, -6, -12, -18, -24, -36, -48, -60];
const FADER_MIN = -60;
const FADER_MAX = 6;

const meterPos = (db) => Math.max(0, Math.min(1, (db - METER_FLOOR) / -METER_FLOOR));
const faderPos = (db) => (db === -Infinity ? 0 : Math.max(0, Math.min(1, (db - FADER_MIN) / (FADER_MAX - FADER_MIN))));
const faderDb = (pos) => (pos <= 0.005 ? -Infinity : FADER_MIN + pos * (FADER_MAX - FADER_MIN));

export default function ChannelStrip({ settings, updateSetting }) {
  const state = useEngineState();
  const canvasRef = useRef(null);
  const peakRef = useRef(null);
  const hold = useRef({ db: -Infinity, at: 0, max: -Infinity });
  const smooth = useRef(-Infinity);
  const [clip, setClip] = useState(false);

  useAnimationFrame(() => {
    const now = performance.now();
    const db = state.open ? toDb(engine.level()) : -Infinity;
    // fast attack, ~20 dB/s release
    smooth.current = db > smooth.current ? db : Math.max(db, smooth.current - 0.35);
    const h = hold.current;
    if (db >= h.db || now - h.at > 1500) {
      h.db = db;
      h.at = now;
    }
    if (db > h.max) h.max = db;
    if (db >= -0.1 && !clip) setClip(true);
    drawMeter(canvasRef.current, smooth.current, h.db);
    if (peakRef.current) peakRef.current.textContent = h.max === -Infinity ? "-∞" : h.max.toFixed(1);
  });

  const resetPeak = () => {
    hold.current.max = -Infinity;
    setClip(false);
  };

  const volDb = toDb(settings.volume);

  return (
    <aside className="flex min-h-0 flex-col bg-panel">
      <div className="pane-title justify-center">Channel</div>

      <div className="flex justify-center gap-1 px-2 pt-2">
        <button
          onClick={resetPeak}
          title="คลิกเพื่อรีเซ็ต"
          className={`h-3 w-full rounded-[2px] border border-edge text-[8px] leading-none font-bold ${clip ? "bg-rec text-white" : "bg-well text-faint"}`}
        >
          CLIP
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5 px-2 py-2">
        <Fader db={volDb} onChange={(db) => updateSetting("volume", fromDb(db))} />
        {/* scale */}
        <div className="relative w-5 font-mono text-[9px] text-dim">
          {SCALE.map((d) => (
            <span key={d} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - meterPos(d)) * 100}%` }}>
              {d}
            </span>
          ))}
        </div>
        <canvas ref={canvasRef} className="h-full w-4 rounded-[2px] border border-edge bg-well" title="Input level (dBFS)" />
      </div>

      <div className="grid grid-cols-2 gap-1 px-2 pb-2">
        <div className="lcd h-5 px-1 text-center text-[10px] leading-5" title="ระดับ fader ฟังสด (dB)">
          {formatDb(volDb)}
        </div>
        <button onClick={resetPeak} className="lcd h-5 px-1 text-center text-[10px] leading-5" title="Peak (dBFS) · คลิกเพื่อรีเซ็ต">
          <span ref={peakRef}>-∞</span>
        </button>
      </div>

      <div className="border-t border-edge p-2">
        <button
          onClick={() => engine.setMonitoring(!state.monitoring)}
          title="ฟังสด (M)"
          className={`ctl w-full ${state.monitoring ? "border-mon bg-mon text-[#16161a] hover:bg-mon" : ""}`}
        >
          <IconMonitor className="size-3" /> Monitor
        </button>
      </div>
      <div className="flex h-7 items-center justify-center border-t border-edge bg-raised text-[11px] font-semibold">
        <span className="mr-1.5 h-3 w-1 bg-accent" />
        Guitar
      </div>
    </aside>
  );
}

function drawMeter(canvas, db, holdDb) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const seg = 3;
  const gap = 1;
  const level = meterPos(db) * h;
  for (let y = h; y > 0; y -= seg + gap) {
    const fromBottom = h - y;
    const segDb = METER_FLOOR + (fromBottom / h) * -METER_FLOOR;
    const lit = fromBottom < level;
    const band = segDb > -6 ? "meter-hi" : segDb > -18 ? "meter-mid" : "meter-lo";
    g.fillStyle = palette[lit ? band : `${band}-off`];
    g.fillRect(1, y - seg, w - 2, seg);
  }
  if (holdDb > METER_FLOOR) {
    const y = h - meterPos(holdDb) * h;
    g.fillStyle = palette.text;
    g.fillRect(1, Math.max(0, y - 1), w - 2, 2);
  }
}

function Fader({ db, onChange }) {
  const trackRef = useRef(null);
  const setFromEvent = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    const pos = 1 - (e.clientY - r.top) / r.height;
    const v = faderDb(Math.max(0, Math.min(1, pos)));
    onChange(v === -Infinity ? -Infinity : Math.round(v * 10) / 10);
  };
  const pos = faderPos(db);
  return (
    <div
      ref={trackRef}
      className="relative w-7 cursor-ns-resize touch-none"
      title="ความดังฟังสด · ดับเบิลคลิก = 0 dB · ล้อเมาส์ = ±0.5 dB"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => e.buttons & 1 && setFromEvent(e)}
      onDoubleClick={() => onChange(0)}
      onWheel={(e) => {
        const cur = db === -Infinity ? FADER_MIN : db;
        onChange(Math.max(FADER_MIN, Math.min(FADER_MAX, cur + (e.deltaY < 0 ? 0.5 : -0.5))));
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-[1px] bg-well" />
      {/* 0 dB mark */}
      <div className="absolute left-0 h-px w-full bg-dim" style={{ top: `${(1 - faderPos(0)) * 100}%` }} />
      <div
        className="absolute left-0 h-6 w-full -translate-y-1/2 rounded-[2px] border border-edge bg-fader"
        style={{ top: `${(1 - pos) * 100}%` }}
      >
        <div className="absolute inset-x-1 top-1/2 h-px bg-edge" />
      </div>
    </div>
  );
}
