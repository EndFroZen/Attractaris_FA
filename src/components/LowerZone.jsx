import TakesPool from "./TakesPool.jsx";
import TunerPanel from "./TunerPanel.jsx";

const TABS = [
  { id: "takes", label: "Takes" },
  { id: "tuner", label: "Tuner" },
];

export default function LowerZone({ tab, setTab, ...poolProps }) {
  return (
    <section className="flex min-h-0 flex-col border-t border-edge bg-panel">
      <div className="flex h-6 shrink-0 items-stretch border-b border-edge bg-panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-r border-edge px-4 text-[10px] font-semibold tracking-[0.12em] uppercase ${
              tab === t.id ? "bg-base text-text" : "text-dim hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 bg-base">{tab === "takes" ? <TakesPool {...poolProps} /> : <TunerPanel />}</div>
    </section>
  );
}
