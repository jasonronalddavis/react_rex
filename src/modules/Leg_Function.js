// src/modules/Leg_Function.js
// Controls Robo Rex leg motions via Web Serial (ESP32-S3).
// Usage (from ControllerPanel):
//   import { walkForward, turnLeft, stop, setGait } from "./modules/Leg_Function";
//   <button onClick={() => walkForward(port, 1.0)}>Walk</button>

const encoder = new TextEncoder();

/**
 * Internal: write a line to the serial port.
 * Adds a trailing newline so your firmware can read line-by-line.
 */
async function send(port, line) {
  if (!port) throw new Error("No serial port. Connect first.");
  if (!port.writable) throw new Error("Port is not writable.");

  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(String(line).trim() + "\n"));
  } finally {
    writer.releaseLock();
  }
}

/**
 * Internal: send a JSON command (handy for tunables)
 * Your firmware can parse this with ArduinoJson.
 */
async function sendJSON(port, obj) {
  const line = JSON.stringify(obj);
  return send(port, line);
}

/* ---------------------------------------------
 * High-level commands (string-based)
 * Mirror these on the ESP32 side in your command parser.
 * --------------------------------------------- */

/**
 * Walk forward at a given normalized speed (0.0 – 1.0).
 */
export async function walkForward(port, speed = 1.0) {
  // Clamp speed
  const s = Math.max(0, Math.min(1, speed));
  return sendJSON(port, { cmd: "rex_walk_forward", speed: s });
}

/**
 * Walk backward at a given normalized speed (0.0 – 1.0).
 */
export async function walkBackward(port, speed = 1.0) {
  const s = Math.max(0, Math.min(1, speed));
  return sendJSON(port, { cmd: "rex_walk_backward", speed: s });
}

/**
 * Turn left in place. rate = 0.0 – 1.0 (how aggressive the turn is).
 */
export async function turnLeft(port, rate = 0.6) {
  const r = Math.max(0, Math.min(1, rate));
  return sendJSON(port, { cmd: "rex_turn_left", rate: r });
}

/**
 * Turn right in place. rate = 0.0 – 1.0.
 */
export async function turnRight(port, rate = 0.6) {
  const r = Math.max(0, Math.min(1, rate));
  return sendJSON(port, { cmd: "rex_turn_right", rate: r });
}

/**
 * Run (faster forward gait). factor scales your current gait speed.
 */
export async function run(port, factor = 1.5) {
  const f = Math.max(0.1, Math.min(3, factor));
  return sendJSON(port, { cmd: "rex_run", factor: f });
}

/**
 * Immediate stop / freeze legs.
 */
export async function stop(port) {
  return sendJSON(port, { cmd: "rex_stop" });
}

/* ---------------------------------------------
 * Tunables (JSON-based config)
 * Call these before/while walking to adjust gait live.
 * --------------------------------------------- */

/**
 * Set gait parameters.
 * @param {SerialPort} port
 * @param {Object} opts
 * @param {number} opts.speed   0.0–1.0 normalized forward speed
 * @param {number} opts.stride  0.0–1.0 stride length (normalized)
 * @param {number} opts.lift    0.0–1.0 foot lift height (normalized)
 * @param {("walk"|"trot"|"run"|"crawl")} opts.mode  gait mode label
 */
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

/**
 * Nudge speed up/down without changing other gait params.
 * delta can be negative. Values are clamped 0–1 on firmware or here.
 */
export async function adjustSpeed(port, delta = 0.1) {
  return sendJSON(port, { cmd: "rex_speed_adjust", delta });
}

/**
 * Set a specific stride length (0.0–1.0).
 */
export async function setStride(port, value = 0.6) {
  const v = Math.max(0, Math.min(1, value));
  return sendJSON(port, { cmd: "rex_stride_set", value: v });
}

/**
 * Quick posture helper (e.g., crouch before a run).
 * level: 0.0 (lowest) – 1.0 (tallest).
 */
export async function setPosture(port, level = 0.5) {
  const v = Math.max(0, Math.min(1, level));
  return sendJSON(port, { cmd: "rex_posture", level: v });
}

/* ---------------------------------------------
 * Raw helper (if you want to send plain strings)
 * --------------------------------------------- */

/**
 * Send a raw string command (advanced/diagnostics).
 * Example: await raw(port, "rex_diag_ping");
 */
export async function raw(port, line) {
  return send(port, line);
}

