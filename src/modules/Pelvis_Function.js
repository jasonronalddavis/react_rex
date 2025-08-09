// src/modules/Pelvis_Function.js
// Pelvis controls with two modes (up / down) + optional set(level).
// Transport-agnostic: prefers BLE shim (port.send / port.sendJson),
// falls back to Web Serial writer when available.

const encoder = new TextEncoder();

/* ---------------- transport helpers ---------------- */

async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");

  // Prefer BLE shim
  if (typeof port.send === "function") {
    // BLE shim expects a single line (it will add \n)
    return port.send(String(line).trim());
  }
  if (typeof port.write === "function") {
    // Some shims expose write()
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

/**
 * Raise pelvis (mode: up)
 * Firmware command: "rex_pelvis_up"
 */
export async function pelvisUp(port) {
  return sendLine(port, "rex_pelvis_up");
}

/**
 * Lower pelvis (mode: down)
 * Firmware command: "rex_pelvis_down"
 */
export async function pelvisDown(port) {
  return sendLine(port, "rex_pelvis_down");
}

/**
 * Explicitly set pelvis level (0.0–1.0). Optional but handy.
 * Firmware command: { "cmd": "rex_pelvis_set", "level": <0..1> }
 */
export async function adjustPelvis(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_pelvis_set", level: v });
}

/**
 * Small helper to nudge pelvis up/down by delta (can be negative).
 * This is optional sugar; firmware may clamp internally.
 */
export async function nudgePelvis(port, delta = +0.05) {
  return sendJSON(port, { cmd: "rex_pelvis_nudge", delta });
}
