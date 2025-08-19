// src/modules/ble/bleClient.js

// Nordic UART-like UUIDs (change if your firmware uses different ones)
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Web -> ESP32 (Write)
const NUS_RX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 -> Web (Notify)

let device, server, service, txChar, rxChar;
const messageHandlers = new Set();
const disconnectHandlers = new Set();

// ---------------- Write queue to prevent "GATT operation already in progress" -----
class WriteQueue {
  constructor() { this._chain = Promise.resolve(); }
  enqueue(task) {
    // Always run tasks sequentially
    this._chain = this._chain.then(task, task);
    return this._chain;
  }
}
const writeQueue = new WriteQueue();

async function writeChunkSafe(buf) {
  // Prefer without-response if available; fall back otherwise.
  if (!txChar) throw new Error("Not connected");
  const hasNoRsp = typeof txChar.writeValueWithoutResponse === "function";
  // Retry once if the adapter is busy
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (hasNoRsp) {
        await txChar.writeValueWithoutResponse(buf);
      } else {
        await txChar.writeValue(buf);
      }
      return;
    } catch (err) {
      const msg = String(err?.message || err);
      // Only retry for the specific busy case
      if (attempt === 0 && /GATT operation already in progress/i.test(msg)) {
        await new Promise(r => setTimeout(r, 20)); // tiny backoff
        continue;
      }
      throw err;
    }
  }
}

// -------------------------------------------------------------------------------

export async function connect({
  namePrefix = "Robo_Rex",
  serviceUuid = NUS_SERVICE_UUID,
} = {}) {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth not supported in this browser.");

  // Accept both legacy and new advertised names
  const filters = [{ namePrefix }, { namePrefix: "Robo_Rex_ESP32S3" }];

  device = await navigator.bluetooth.requestDevice({
    filters,
    optionalServices: [serviceUuid],
  });

  server = await device.gatt.connect();
  service = await server.getPrimaryService(serviceUuid);
  txChar  = await service.getCharacteristic(NUS_TX_UUID);
  rxChar  = await service.getCharacteristic(NUS_RX_UUID);

  await rxChar.startNotifications();
  rxChar.addEventListener("characteristicvaluechanged", handleNotify);
  device.addEventListener("gattserverdisconnected", handleDisconnected);

  console.log("✅ BLE connected");
  return { device, server, txChar, rxChar };
}

export async function disconnect() {
  try { await rxChar?.stopNotifications(); } catch {}
  try { await server?.disconnect(); } catch {}
  cleanupRefs();
  console.warn("🔌 BLE disconnected");
}

export function isConnected() {
  return !!(server && server.connected && txChar);
}

/** Subscribe to RX messages; returns an unsubscribe function. */
export function onMessage(fn) {
  messageHandlers.add(fn);
  return () => messageHandlers.delete(fn);
}

/** Subscribe to disconnect event; returns an unsubscribe function. */
export function onDisconnect(fn) {
  disconnectHandlers.add(fn);
  return () => disconnectHandlers.delete(fn);
}

/** Low-level line send with newline + MTU chunking, serialized via queue. */
export async function sendString(line) {
  if (!isConnected()) throw new Error("Not connected");
  const enc = new TextEncoder();
  const bytes = enc.encode(line.endsWith("\n") ? line : line + "\n");

  // Keep under typical 20-byte ATT MTU payload (use 18-19 to be safe)
  const CHUNK = 18;

  return writeQueue.enqueue(async () => {
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      await writeChunkSafe(slice);
      // Small pacing helps on some stacks
      if (i + CHUNK < bytes.length) await new Promise(r => setTimeout(r, 2));
    }
  });
}

export async function sendJson(obj) {
  return sendString(JSON.stringify(obj));
}

/**
 * Canonical control API:
 *   { target, part, command, phase }
 * Matches firmware CommandRouter contract.
 */
export async function sendControl(target, part, command, phase) {
  return sendJson({ target, part, command, phase });
}

/**
 * BACKWARD-COMPAT shim (deprecated):
 * Older UI called sendCommand(target, direction, phase).
 */
export async function sendCommand(target, direction, phase) {
  return sendControl(target, "full", direction, phase);
}

/** Optional: generic action wrapper if you prefer action-types in firmware. */
export async function sendAction(type, payload = {}) {
  return sendJson({ type, ...payload });
}

// --------------------------- internals ---------------------------

function handleNotify(e) {
  const dv = e.target?.value || new DataView(new ArrayBuffer(0));
  const text = new TextDecoder().decode(dv).trim();
  for (const fn of messageHandlers) {
    try { fn(text, dv); } catch {}
  }
  if (text) console.log("🦖 Rex → Web:", text);
}

function handleDisconnected() {
  for (const fn of disconnectHandlers) {
    try { fn(); } catch {}
  }
  cleanupRefs();
}

function cleanupRefs() {
  device = undefined;
  server = undefined;
  service = undefined;
  txChar = undefined;
  rxChar = undefined;
}
