// src/ble/bleClient.js
// Nordic UART-like UUIDs (change if your firmware uses different ones)
const NUS_SERVICE_UUID  = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID       = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Web -> ESP32 (Write)
const NUS_RX_UUID       = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // ESP32 -> Web (Notify)

let device, server, service, txChar, rxChar;

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
  rxChar.addEventListener("characteristicvaluechanged", (e) => {
    const msg = new TextDecoder().decode(e.target.value);
    console.log("🦖 Rex → Web:", msg.trim());
  });

  device.addEventListener("gattserverdisconnected", () => {
    console.warn("🔌 BLE disconnected");
  });

  console.log("✅ BLE connected");
  return { device, server, txChar, rxChar };
}

export async function disconnect() {
  try { await rxChar?.stopNotifications(); } catch {}
  try { await server?.disconnect(); } catch {}
  device = server = service = txChar = rxChar = undefined;
}

export function isConnected() {
  return !!(server && server.connected && txChar);
}

export async function sendString(line) {
  if (!isConnected()) throw new Error("Not connected");
  const data = new TextEncoder().encode(line.endsWith("\n") ? line : line + "\n");
  // split long payloads to avoid 20-byte MTU issues
  const CHUNK = 18;
  for (let i = 0; i < data.length; i += CHUNK) {
    await txChar.writeValue(data.slice(i, i + CHUNK));
  }
}

export async function sendJson(obj) {
  await sendString(JSON.stringify(obj));
}
