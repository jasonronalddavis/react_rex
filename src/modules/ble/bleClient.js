// src/modules/ble/bleClient.js

// ─────────────────────────────────────────────────────────────────────────────
// Nordic UART-like UUIDs (same as firmware in main.cpp / BLEServerHandler):
//   Service: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
//   RX  (Web -> ESP32, Write):  6e400002-b5a3-f393-e0a9-e50e24dcca9e
//   TX  (ESP32 -> Web, Notify): 6e400003-b5a3-f393-e0a9-e50e24dcca9e
// ─────────────────────────────────────────────────────────────────────────────

const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // WRITE  (Web -> ESP32)
const NUS_TX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // NOTIFY (ESP32 -> Web)

let device, server, service, rxChar /* write */, txChar /* notify */;
const messageHandlers = new Set();
const disconnectHandlers = new Set();

export async function connect({
  // Accept both current and legacy name prefixes
  namePrefix = "Robo_Rex",
  altNamePrefix = "Robo_Rex_ESP32S3",
  serviceUuid = NUS_SERVICE_UUID,
} = {}) {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth not supported in this browser.");
  }

  const filters = [];
  if (namePrefix)    filters.push({ namePrefix });
  if (altNamePrefix) filters.push({ namePrefix: altNamePrefix });
  if (filters.length === 0) filters.push({ services: [serviceUuid] });

  device = await navigator.bluetooth.requestDevice({
    filters,
    optionalServices: [serviceUuid],
  });

  server  = await device.gatt.connect();
  service = await server.getPrimaryService(serviceUuid);

  // Wire up characteristics (RX = write, TX = notify)
  rxChar = await service.getCharacteristic(NUS_RX_UUID);
  txChar = await service.getCharacteristic(NUS_TX_UUID);

  await txChar.startNotifications();
  txChar.addEventListener("characteristicvaluechanged", handleNotify);

  device.addEventListener("gattserverdisconnected", handleDisconnected);

  console.log("✅ BLE connected to", device.name || "(unnamed)");
  return { device, server, service, rxChar, txChar };
}

export async function disconnect() {
  try { await txChar?.stopNotifications(); } catch {}
  try { await server?.disconnect(); } catch {}
  cleanupRefs();
  console.warn("🔌 BLE disconnected");
}

export function isConnected() {
  return !!(server && server.connected && rxChar);
}

// ─────────────────────── Subscriptions ───────────────────────

/** Subscribe to text messages coming from ESP32 (TX notify). */
export function onMessage(fn) {
  messageHandlers.add(fn);
  return () => messageHandlers.delete(fn);
}

/** Subscribe to disconnect events. */
export function onDisconnect(fn) {
  disconnectHandlers.add(fn);
  return () => disconnectHandlers.delete(fn);
}

// ─────────────────────── Sending helpers ───────────────────────

/**
 * Low-level send of a line. Appends '\n' and chunks under typical 20B MTU.
 * Writes to RX (write) characteristic on the ESP32 side.
 */
export async function sendString(line) {
  if (!isConnected()) throw new Error("Not connected");
  const enc = new TextEncoder();
  const bytes = enc.encode(line.endsWith("\n") ? line : line + "\n");
  const CHUNK = 18; // conservative to fit 20B MTU devices
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await rxChar.writeValue(bytes.slice(i, i + CHUNK));
  }
}

/** JSON helper (adds newline automatically). */
export async function sendJson(obj) {
  return sendString(JSON.stringify(obj));
}

/**
 * Canonical control message used by the firmware CommandRouter:
 *   { target, part, command, phase }
 * - target: "legsPelvis" | "headNeck" | "tailSpine" | "fullBody"
 * - part:   "legs" | "pelvis" | "head" | "neck" | "tail" | "spine" | "full"
 * - command: e.g. "move_forward", "neck_left", "spine_up", etc.
 * - phase:  "start" | "hold" | "stop" (or omit if sending one-shots)
 */
export async function sendControl(target, part, command, phase) {
  return sendJson({ target, part, command, phase });
}

/**
 * Back-compat shim for older UI that called (target, direction, phase).
 * It maps to part="full" so firmware can still act on generic moves.
 */
export async function sendCommand(target, direction, phase) {
  return sendControl(target, "full", direction, phase);
}

/** Optional: generic action wrapper if your firmware routes on a 'type' field. */
export async function sendAction(type, payload = {}) {
  return sendJson({ type, ...payload });
}

// ─────────────────────── Internals ───────────────────────

function handleNotify(e) {
  const dv = e.target?.value || new DataView(new ArrayBuffer(0));
  const text = new TextDecoder().decode(dv).trim();
  // Fan out to listeners first
  for (const fn of messageHandlers) {
    try { fn(text, dv); } catch (err) { /* ignore */ }
  }
  // Also log for convenience
  if (text) console.log("🦖 Rex → Web:", text);
}

function handleDisconnected() {
  for (const fn of disconnectHandlers) {
    try { fn(); } catch (err) { /* ignore */ }
  }
  cleanupRefs();
}

function cleanupRefs() {
  device = undefined;
  server = undefined;
  service = undefined;
  rxChar = undefined;
  txChar = undefined;
}

// ─────────────────────── Convenience (optional) ───────────────────────

/**
 * Tiny helper you can assign in App.jsx to mirror BLE availability into UI.
 * Usage:
 *   onMessage(line => addToLog(line));
 *   onDisconnect(() => setConnected(false));
 */
export const status = {
  get connected() { return isConnected(); },
};
