import { useDevices, useEngineState } from "../hooks.js";

export default function StatusBar({ message, settings }) {
  const state = useEngineState();
  const { inputs, outputs } = useDevices();
  const inName = inputs.find((d) => d.id === settings.inputId)?.label ?? "Default input";
  const outName = outputs.find((d) => d.id === settings.outputId)?.label ?? "Default output";

  return (
    <footer className="flex h-6 items-center gap-4 border-t border-edge bg-panel px-3 text-[10px] text-dim">
      <span className="min-w-0 flex-1 truncate">{message || "Ready"}</span>
      <Flag on={state.open} label="Input" />
      <Flag on={state.monitoring} label="Monitor" />
      <Flag on={state.recording} label="Rec" />
      <Flag on={state.tuning} label="Tuner" />
      <span className="max-w-64 truncate" title={inName}>
        In: {inName}
      </span>
      <span className="max-w-64 truncate" title={outName}>
        Out: {outName}
      </span>
    </footer>
  );
}

function Flag({ on, label }) {
  return <span className={on ? "text-text" : "text-faint"}>{label}</span>;
}
