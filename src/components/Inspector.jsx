import { useState } from "react";
import { useDevices, useEngineState } from "../hooks.js";
import { IconRefresh } from "./Icons.jsx";

const CHANNELS = [
  { value: "0", label: "In 1" },
  { value: "1", label: "In 2" },
  { value: "mix", label: "1+2" },
];
const LATENCIES = [
  { value: "0", label: "Low", note: "หน่วงต่ำสุด อาจมีเสียงแตก" },
  { value: "interactive", label: "Normal", note: "ค่าแนะนำ" },
  { value: "playback", label: "Safe", note: "หน่วงมาก แต่เสถียรที่สุด" },
];

export default function Inspector({ settings, updateSetting, takeCount }) {
  const { inputs, outputs, refresh } = useDevices();
  const { recording } = useEngineState();
  const inputName = inputs.find((d) => d.id === settings.inputId)?.label ?? "Default input";
  const latency = LATENCIES.find((l) => l.value === settings.latency);

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto bg-panel">
      <div className="flex h-9 items-center gap-2 border-b border-edge bg-raised pr-2">
        <span className="h-full w-1 bg-accent" />
        <span className="flex-1 text-[12px] font-semibold">Guitar</span>
        <span className="truncate text-[10px] text-dim">Mono · {CHANNELS.find((c) => c.value === settings.channel)?.label}</span>
      </div>

      <Section title="Input routing">
        <Row label="Device">
          <div className="flex gap-1">
            <select
              className="field"
              value={settings.inputId}
              disabled={recording}
              onChange={(e) => updateSetting("inputId", e.target.value)}
              title={inputName}
            >
              <option value="">Default input</option>
              {inputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <button className="ctl w-6 shrink-0 px-0" onClick={refresh} title="รีเฟรชรายการอุปกรณ์">
              <IconRefresh className="size-3" />
            </button>
          </div>
        </Row>
        <Row label="Channel">
          <Segmented options={CHANNELS} value={settings.channel} onChange={(v) => updateSetting("channel", v)} />
        </Row>
      </Section>

      <Section title="Output routing">
        <Row label="Device">
          <select className="field" value={settings.outputId} onChange={(e) => updateSetting("outputId", e.target.value)}>
            <option value="">Default output</option>
            {outputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title="Monitoring">
        <Row label="Buffer">
          <Segmented
            options={LATENCIES}
            value={settings.latency}
            onChange={(v) => updateSetting("latency", v)}
            disabled={recording}
          />
        </Row>
        <p className="px-2 pb-1 text-[10px] leading-4 text-dim">{latency?.note}. ถ้าฟังสดแล้วเสียงแตก ให้เพิ่ม buffer</p>
        <p className="px-2 pb-1 text-[10px] leading-4 text-dim">ใช้หูฟังเท่านั้น ถ้าเปิดลำโพงเสียงจะหอน</p>
      </Section>

      <Section title="Storage">
        <Info label="Folder" value="Music\Attractaris" />
        <Info label="Takes" value={String(takeCount)} />
        <Info label="Format" value="WebM · Opus" />
      </Section>

      <Section title="Shortcuts" defaultOpen={false}>
        <Info label="Play / Stop" value="Space" />
        <Info label="Record" value="R" />
        <Info label="Monitor" value="M" />
        <Info label="Tuner" value="T" />
      </Section>
    </aside>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-edge">
      <button onClick={() => setOpen(!open)} className="pane-title w-full gap-1.5 hover:text-text">
        <span className={`inline-block text-[8px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {title}
      </button>
      {open && <div className="space-y-1.5 py-2">{children}</div>}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-2 px-2">
      <span className="text-[11px] text-dim">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex justify-between gap-2 px-2 text-[11px]">
      <span className="text-dim">{label}</span>
      <span className="truncate font-mono text-text">{value}</span>
    </div>
  );
}

export function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="flex h-6 overflow-hidden rounded-[3px] border border-line">
      {options.map((o, i) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 text-[11px] disabled:opacity-40 ${i ? "border-l border-line" : ""} ${
            value === o.value ? "bg-accent-soft text-text" : "bg-raised text-dim hover:bg-hover hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
