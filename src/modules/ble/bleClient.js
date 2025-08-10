// src/modules/ble/bleClient.js
// Nordic UART-like UUIDs (change if your firmware uses different ones)
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Web -> ESP32 (Write)
const NUS_RX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 -> Web (Notify)

let device, server, service, txChar, rxChar;
const messageHandlers = new Set();
const disconnectHandlers = new Set();

export async function connect({ namePrefix = "Robo_Rex", serviceUuid = NUS_SERVICE_UUID } = {}) {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth not supported in this browser.");

  device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix }],
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

/** Low-level line send with newline + MTU chunking. */
export async function sendString(line) {
  if (!isConnected()) throw new Error("Not connected");
  const enc = new TextEncoder();
  const bytes = enc.encode(line.endsWith("\n") ? line : line + "\n");
  const CHUNK = 18; // stay under typical 20B MTU
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await txChar.writeValue(bytes.slice(i, i + CHUNK));
  }
}

export async function sendJson(obj) {
  return sendString(JSON.stringify(obj));
}

/** Convenience for the new UI: start/hold/stop control packets. */
export async function sendCommand(target, direction, phase) {
  // Example payload. Align with your firmware exactly if names differ.
  return sendJson({ target, direction, phase });
}

/** Optional: generic action wrapper if you prefer action-types in firmware. */
export async function sendAction(type, payload = {}) {
  return sendJson({ type, ...payload });
}

// --------------------------- internals ---------------------------

function handleNotify(e) {
  const dv = e.target?.value || new DataView(new ArrayBuffer(0));
  const text = new TextDecoder().decode(dv).trim();
  // Fan out to all message subscribers
  for (const fn of messageHandlers) {
    try { fn(text, dv); } catch {}
  }
  // Also log to console for dev convenience
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
