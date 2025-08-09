// src/modules/Leg_Function.js
// Transport-agnostic leg controls (works with BLE shim OR Web Serial).
// If `port.send` / `port.sendJson` exist, they are used.
// Otherwise we fall back to Web Serial (port.writable.getWriter()).

const encoder = new TextEncoder();

/* ---------------- Transport helpers ---------------- */

async function sendLine(port, line) {
  if (!port) throw new Error("No port. Connect first.");

  // Prefer BLE shim
  if (typeof port.send === "function") {
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
  const line = JSON.stringify(obj);
  // Prefer BLE shim JSON if available
  if (typeof port.sendJson === "function") {
    return port.sendJson(obj);
  }
  return sendLine(port, line);
}

/* ---------------- High-level commands ---------------- */

export async function walkForward(port, speed = 1.0) {
  const s = Math.max(0, Math.min(1, speed));
  return sendJSON(port, { cmd: "rex_walk_forward", speed: s });
}

export async function walkBackward(port, speed = 1.0) {
  const s = Math.max(0, Math.min(1, speed));
  return sendJSON(port, { cmd: "rex_walk_backward", speed: s });
}

export async function turnLeft(port, rate = 0.6) {
  const r = Math.max(0, Math.min(1, rate));
  return sendJSON(port, { cmd: "rex_turn_left", rate: r });
}

export async function turnRight(port, rate = 0.6) {
  const r = Math.max(0, Math.min(1, rate));
  return sendJSON(port, { cmd: "rex_turn_right", rate: r });
}

export async function run(port, factor = 1.5) {
  const f = Math.max(0.1, Math.min(3, factor));
  return sendJSON(port, { cmd: "rex_run", factor: f });
}

export async function stop(port) {
  return sendJSON(port, { cmd: "rex_stop" });
}

/* ---------------- Tunables ---------------- */

export async function setGait(
  port,
  { speed = 0.7, stride = 0.6, lift = 0.4, mode = "walk" } = {}
) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  return sendJSON(port, {
    cmd: "rex_gait",
    speed: clamp01(speed),
    stride: clamp01(stride),
    lift: clamp01(lift),
    mode,
  });
}

export async function adjustSpeed(port, delta = 0.1) {
  return sendJSON(port, { cmd: "rex_speed_adjust", delta });
}

export async function setStride(port, value = 0.6) {
  const v = Math.max(0, Math.min(1, value));
  return sendJSON(port, { cmd: "rex_stride_set", value: v });
}

export async function setPosture(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, level));
  return sendJSON(port, { cmd: "rex_posture", level: v });
}

/* ---------------- Raw helper ---------------- */

export async function raw(port, line) {
  return sendLine(port, line);
}
