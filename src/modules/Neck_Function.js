// Neck_Function.js
// Neck yaw controls: left / right / center / set(level)
// (0.0 = full left, 0.5 = center, 1.0 = full right)
// Transport-agnostic: prefers BLE shim, falls back to Web Serial.

const encoder = new TextEncoder();

/* -------------- transport helpers -------------- */
async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");
  if (typeof port.send === "function") return port.send(String(line).trim()); // BLE shim
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

/* -------------- public API (Yaw) -------------- */

/** Turn head/neck fully left (plain string). */
export async function neckLeft(port) {
  // Optional JSON alternative: return neckYawSet(port, 0.0);
  return sendLine(port, "rex_neck_left");
}

/** Turn head/neck fully right (plain string). */
export async function neckRight(port) {
  // Optional JSON alternative: return neckYawSet(port, 1.0);
  return sendLine(port, "rex_neck_right");
}

/** Center the neck yaw. */
export async function neckCenter(port) {
  // return sendLine(port, "rex_neck_center");
  return neckYawSet(port, 0.5);
}

/**
 * Explicit yaw set (0.0–1.0).
 * Firmware JSON command: { "cmd": "rex_neck_yaw_set", "level": <0..1> }
 */
export async function neckYawSet(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_neck_yaw_set", level: v });
}

/* -------------- optional pitch helpers -------------- */
/** If you later want up/down pitch, mirror this pattern:
export async function neckPitchUp(port)  { return sendLine(port, "rex_neck_pitch_up"); }
export async function neckPitchDown(port){ return sendLine(port, "rex_neck_pitch_down"); }
export async function neckPitchSet(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, Number(level)));
  return sendJSON(port, { cmd: "rex_neck_pitch_set", level: v });
}
*/
