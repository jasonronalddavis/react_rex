// Tail_Function.js
// Tail controls: left / right / center / set(level) / wag()
// Transport-agnostic: prefers BLE shim, falls back to Web Serial.

const encoder = new TextEncoder();

/* -------------- transport helpers -------------- */
async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");
  if (typeof port.send === "function") return port.send(String(line).trim()); // BLE shim adds "\n"
  if (typeof port.write === "function") return port.write(String(line).trim()); // generic shim

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

/* -------------- public API -------------- */

/** Move tail fully to the left (plain string command). */
export async function tailLeft(port) {
  // Optional: if firmware prefers JSON only, use tailSet(port, 0.0);
  return sendLine(port, "rex_tail_left");
}

/** Move tail fully to the right (plain string command). */
export async function tailRight(port) {
  // Optional: tailSet(port, 1.0);
  return sendLine(port, "rex_tail_right");
}

/** Center the tail (plain string or set 0.5). */
export async function tailCenter(port) {
  // Either of these work; keep the string AND JSON available:
  // return sendLine(port, "rex_tail_center");
  return tailSet(port, 0.5);
}

/**
 * Explicit tail position (0.0 = full left, 0.5 = center, 1.0 = full right).
 * Firmware JSON command: { "cmd": "rex_tail_set", "level": <0..1> }
 */
export async function tailSet(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_tail_set", level: v });
}

/** Tail wag sequence (plain string trigger). */
export async function tailWag(port) {
  return sendLine(port, "rex_tail_wag");
}
