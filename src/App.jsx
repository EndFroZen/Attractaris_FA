import { useCallback, useEffect, useRef, useState } from "react";
import { engine, DEFAULT_SETTINGS } from "./audio/engine.js";
import { player } from "./audio/player.js";
import { forgetPeaks } from "./audio/waveform.js";
import { addRecording, deleteRecording, listRecordings, loadSettings, renameRecording, saveSetting } from "./db.js";
import { useEngineState } from "./hooks.js";
import { applyTheme } from "./theme.js";
import Transport from "./components/Transport.jsx";
import Inspector from "./components/Inspector.jsx";
import TrackLane from "./components/TrackLane.jsx";
import LowerZone from "./components/LowerZone.jsx";
import ChannelStrip from "./components/ChannelStrip.jsx";
import StatusBar from "./components/StatusBar.jsx";

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [takes, setTakes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lowerTab, setLowerTab] = useState("takes");
  const [message, setMessage] = useState("");
  const state = useEngineState();

  const report = useCallback((text) => setMessage(String(text)), []);

  // Apply during render (idempotent) so children's canvas effects already see the new palette.
  if (document.documentElement.dataset.theme !== settings.theme) applyTheme(settings.theme);

  // ---- settings (SQLite) ----
  useEffect(() => {
    loadSettings()
      .then((saved) => {
        const merged = { ...DEFAULT_SETTINGS, ...saved };
        setSettings(merged);
        engine.updateSettings(merged);
      })
      .catch((err) => report("โหลดการตั้งค่าไม่ได้: " + err));
  }, [report]);

  const updateSetting = useCallback(
    (key, value) => {
      setSettings((s) => ({ ...s, [key]: value }));
      engine.updateSettings({ [key]: value });
      saveSetting(key, value).catch((err) => report("บันทึกการตั้งค่าไม่ได้: " + err));
    },
    [report]
  );

  // ---- takes (SQLite) ----
  const reloadTakes = useCallback(
    () =>
      listRecordings()
        .then((rows) => {
          setTakes(rows);
          return rows;
        })
        .catch((err) => {
          report("โหลดรายการเทคไม่ได้: " + err);
          return [];
        }),
    [report]
  );
  useEffect(() => {
    reloadTakes().then((rows) => rows[0] && setSelectedId((id) => id ?? rows[0].id));
  }, [reloadTakes]);

  const selected = takes.find((t) => t.id === selectedId) ?? null;

  const toggleRecord = useCallback(async () => {
    // Busy covers "starting" too, so a second press while the input opens means stop, not a second take.
    if (!engine.isRecordBusy()) {
      player.stop();
      return engine.startRecording();
    }
    const take = await engine.stopRecording();
    if (!take) return;
    try {
      const saved = await addRecording(take.blob, take.durationMs);
      await reloadTakes();
      setSelectedId(saved.id);
      report(`บันทึก ${saved.name} แล้ว · ${saved.path}`);
    } catch (err) {
      report("เซฟไม่สำเร็จ: " + err);
    }
  }, [reloadTakes, report]);

  const playTake = useCallback(
    async (take) => {
      try {
        await player.play(take);
      } catch (err) {
        report("เล่นไฟล์ไม่ได้: " + (err?.message || err));
      }
    },
    [report]
  );

  const togglePlay = useCallback(async () => {
    if (player.state.playingId != null) return player.stop();
    if (selected) await playTake(selected);
  }, [selected, playTake]);

  /** Space: stops a take in progress, otherwise toggles playback (DAW convention). */
  const stopOrPlay = useCallback(() => (engine.isRecordBusy() ? toggleRecord() : togglePlay()), [toggleRecord, togglePlay]);

  const removeTake = useCallback(
    async (take) => {
      if (!confirm(`ลบ "${take.name}" ถาวร?`)) return;
      if (player.state.playingId === take.id) player.stop();
      try {
        await deleteRecording(take);
        forgetPeaks(take.path);
        const rows = await reloadTakes();
        if (selectedId === take.id) setSelectedId(rows[0]?.id ?? null);
        report(`ลบ ${take.name} แล้ว`);
      } catch (err) {
        report("ลบไม่สำเร็จ: " + err);
      }
    },
    [reloadTakes, selectedId, report]
  );

  const renameTake = useCallback(
    async (take, name) => {
      const clean = name.trim();
      if (!clean || clean === take.name) return;
      try {
        await renameRecording(take.id, clean);
        await reloadTakes();
      } catch (err) {
        report("เปลี่ยนชื่อไม่สำเร็จ: " + err);
      }
    },
    [reloadTakes, report]
  );

  // ---- keyboard: Space play/stop · R record · M monitor · T tuner ----
  const keys = useRef({});
  keys.current = { toggleRecord, stopOrPlay };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, select, textarea") || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        keys.current.stopOrPlay();
      } else if (k === "r") keys.current.toggleRecord();
      else if (k === "m") engine.setMonitoring(!engine.state.monitoring);
      else if (k === "t") setLowerTab((t) => (t === "tuner" ? "takes" : "tuner"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // errorId changes on every failure, so a repeated identical error is still shown.
  useEffect(() => {
    if (state.errorId && state.error) report(state.error);
  }, [state.errorId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto]">
      <Transport
        onRecord={toggleRecord}
        onPlay={togglePlay}
        canPlay={!!selected}
        lowerTab={lowerTab}
        setLowerTab={setLowerTab}
        theme={settings.theme}
        onToggleTheme={() => updateSetting("theme", settings.theme === "light" ? "dark" : "light")}
      />

      <div className="grid min-h-0 grid-cols-[264px_1fr_132px] border-t border-edge">
        <Inspector settings={settings} updateSetting={updateSetting} takeCount={takes.length} />
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(180px,1fr)_minmax(260px,42%)] border-x border-edge">
          <TrackLane take={selected} settings={settings} />
          <LowerZone
            tab={lowerTab}
            setTab={setLowerTab}
            takes={takes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPlay={playTake}
            onRename={renameTake}
            onDelete={removeTake}
            report={report}
          />
        </div>
        <ChannelStrip settings={settings} updateSetting={updateSetting} />
      </div>

      <StatusBar message={message} settings={settings} />
    </div>
  );
}
