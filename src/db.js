// SQLite persistence (tauri-plugin-sql). Schema lives in src-tauri/src/lib.rs migrations.
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let dbPromise = null;
const db = () => (dbPromise ??= Database.load("sqlite:attractaris.db"));

// ---- settings (key/value, values stored as JSON) ----
export async function loadSettings() {
  const rows = await (await db()).select("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}

export async function saveSetting(key, value) {
  await (await db()).execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
}

// ---- recordings ----
export async function listRecordings() {
  return (await db()).select("SELECT * FROM recordings ORDER BY id DESC");
}

/** Writes the audio file via Rust, then records it in the library. */
export async function addRecording(blob, durationMs) {
  const ext = (blob.type.match(/^audio\/(\w+)/) || [])[1] || "webm";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = await invoke("save_recording", bytes, { headers: { "x-ext": ext } });
  let id = null;
  try {
    const conn = await db();
    const res = await conn.execute("INSERT INTO recordings (name, path, duration_ms, mime) VALUES ('', $1, $2, $3)", [
      path,
      durationMs,
      blob.type,
    ]);
    // Name from the row id (AUTOINCREMENT never reuses ids), so names stay unique after deletes.
    id = res.lastInsertId;
    const name = `Take ${id}`;
    await conn.execute("UPDATE recordings SET name = $1 WHERE id = $2", [name, id]);
    return { id, name, path };
  } catch (err) {
    // Don't leave a half-saved take behind: no untracked file, no row pointing at a deleted file.
    if (id != null) await (await db()).execute("DELETE FROM recordings WHERE id = $1", [id]).catch(() => {});
    await invoke("delete_recording", { path }).catch(() => {});
    throw err;
  }
}

export async function renameRecording(id, name) {
  await (await db()).execute("UPDATE recordings SET name = $1 WHERE id = $2", [name, id]);
}

export async function deleteRecording(rec) {
  await invoke("delete_recording", { path: rec.path });
  await (await db()).execute("DELETE FROM recordings WHERE id = $1", [rec.id]);
}

export async function recordingBlob(rec) {
  const buf = await invoke("read_recording", { path: rec.path });
  return new Blob([buf], { type: rec.mime || "audio/webm" });
}
