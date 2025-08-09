// Mouth_Function.js
// Mouth control: two modes (up=open, down=close) + optional proportional set(level).
// Transport-agnostic: prefers BLE shim (port.send / port.sendJson),
// falls back to Web Serial writer if present.

const encoder = new TextEncoder();

/* ------------ transport helpers ------------ */
async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");

  // Prefer BLE shim
  if (typeof port.send === "function") return port.send(String(line).trim());
  if (typeof port.write === "function") return port.write(String(line).trim());

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
  if (typeof port.sendJson === "function") return port.sendJson(obj);
  return sendLine(port, JSON.stringify(obj));
}

/* ---------------- public API ---------------- */

/** Up = open mouth (string command expected by firmware). */
export async function mouthUp(port) {
  // Matches firmware command router: "rex_mouth_open"
  return sendLine(port, "rex_mouth_open");
}

/** Down = close mouth (string command expected by firmware). */
export async function mouthDown(port) {
  // Matches firmware command router: "rex_mouth_close"
  return sendLine(port, "rex_mouth_close");
}

/** Optional proportional control 0..1 if firmware supports it. */
export async function mouthSet(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_mouth_set", level: v });
}
