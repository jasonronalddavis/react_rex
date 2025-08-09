// src/modules/Spine_Function.js
// Spine controls with two modes (up / down) + explicit set(level).
// Transport-agnostic: prefers BLE shim (port.send / port.sendJson),
// falls back to Web Serial writer if present.

const encoder = new TextEncoder();

/* ---------------- transport helpers ---------------- */

async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");

  // Prefer BLE shim
  if (typeof port.send === "function") {
    return port.send(String(line).trim()); // shim adds "\n"
  }
  if (typeof port.write === "function") {
    return port.write(String(line).trim());
  }

  // Fallback: Web Serial
  if (!port.writable) throw new Error("Port is not writable.");
  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(String(line).trim() + "\n"));
  } finally {
    writer.releaseLock();
  }
}

async function sendJSON(port, obj) {
  if (typeof port.sendJson === "function") {
    return port.sendJson(obj);
  }
  return sendLine(port, JSON.stringify(obj));
}

/* ---------------- public API ---------------- */

/** Raise spine (mode: up) — firmware expects plain string "rex_spine_up" */
export async function spineUp(port) {
  return sendLine(port, "rex_spine_up");
}

/** Lower spine (mode: down) — firmware expects plain string "rex_spine_down" */
export async function spineDown(port) {
  return sendLine(port, "rex_spine_down");
}

/** Explicit spine position, 0.0–1.0 — {"cmd":"rex_spine_set","level":...} */
export async function spineSet(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_spine_set", level: v });
}

/** Optional helper: small nudge up/down by delta (can be negative) */
export async function spineNudge(port, delta = +0.05) {
  return sendJSON(port, { cmd: "rex_spine_nudge", delta });
}
