import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { player } from "../audio/player.js";
import { formatDuration, usePlayerState } from "../hooks.js";
import { IconFolder, IconPlay, IconStop, IconTrash } from "./Icons.jsx";

export default function TakesPool({ takes, selectedId, onSelect, onPlay, onRename, onDelete, report }) {
  const { playingId } = usePlayerState();
  const [editingId, setEditingId] = useState(null);

  // Goes through App's playTake, which reports errors (including "stop recording first").
  const togglePlay = (take) => {
    if (playingId === take.id) return player.stop();
    onSelect(take.id);
    onPlay(take);
  };

  if (!takes.length) {
    return <div className="grid h-full place-items-center text-[11px] text-faint">ยังไม่มีเทค · กด R เพื่ออัดเทคแรก</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-panel text-left text-[10px] text-dim">
          <tr className="h-6 border-b border-edge">
            <th className="w-8" />
            <th className="w-10 px-2 font-normal">#</th>
            <th className="px-2 font-normal">Name</th>
            <th className="w-20 px-2 font-normal">Length</th>
            <th className="w-40 px-2 font-normal">Recorded</th>
            <th className="w-28 px-2 font-normal">Type</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {takes.map((take, i) => {
            const sel = take.id === selectedId;
            const playing = playingId === take.id;
            return (
              <tr
                key={take.id}
                onClick={() => onSelect(take.id)}
                onDoubleClick={() => togglePlay(take)}
                className={`group h-7 border-b border-panel ${sel ? "bg-accent-soft" : i % 2 ? "bg-base" : "bg-stripe"} hover:bg-hover`}
              >
                <td className="text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay(take);
                    }}
                    className={`grid size-5 place-items-center rounded-[2px] ${playing ? "text-accent" : "text-dim hover:text-text"}`}
                    title={playing ? "หยุด" : "เล่น"}
                  >
                    {playing ? <IconStop className="size-3" /> : <IconPlay className="size-3" />}
                  </button>
                </td>
                <td className="px-2 font-mono text-dim">{takes.length - i}</td>
                <td className="truncate px-2" onDoubleClick={(e) => (e.stopPropagation(), setEditingId(take.id))}>
                  {editingId === take.id ? (
                    <input
                      autoFocus
                      defaultValue={take.name}
                      className="field h-5"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        setEditingId(null);
                        onRename(take, e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <span title="ดับเบิลคลิกเพื่อเปลี่ยนชื่อ">{take.name}</span>
                  )}
                </td>
                <td className="px-2 font-mono">{formatDuration(take.duration_ms)}</td>
                <td className="px-2 font-mono text-dim">{take.created_at}</td>
                <td className="truncate px-2 text-dim">{(take.mime || "audio/webm").replace("audio/", "").split(";")[0].toUpperCase()}</td>
                <td className="px-1">
                  <span className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                    <RowBtn title="แสดงในโฟลเดอร์" onClick={() => revealItemInDir(take.path).catch(report)}>
                      <IconFolder className="size-3" />
                    </RowBtn>
                    <RowBtn title="ลบ" danger onClick={() => onDelete(take)}>
                      <IconTrash className="size-3" />
                    </RowBtn>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowBtn({ danger, onClick, children, ...props }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid size-5 place-items-center rounded-[2px] text-dim hover:bg-raised ${danger ? "hover:text-rec" : "hover:text-text"}`}
    >
      {children}
    </button>
  );
}
