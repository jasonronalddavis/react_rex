// src/App.js
import { useEffect, useMemo, useRef, useState } from "react";
import ControllerPanel from "./ControllerPanel";

// Nordic UART (change if your firmware uses other UUIDs)
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write
const NUS_RX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify

export default function App() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [log, setLog] = useState([]);
//Controller_Panel
  const deviceRef = useRef(null);
  const serverRef = useRef(null);
  const txRef = useRef(null);
  const rxRef = useRef(null);

  const pushLog = (line) =>
    setLog((l) => [
      ...l.slice(-200),
      `[${new Date().toLocaleTimeString()}] ${line}`,
    ]);

  async function connectBLE() {
    if (connecting || connected) return;
    try {
      setConnecting(true);
      if (!("bluetooth" in navigator)) {
        alert("Web Bluetooth not supported. Use Chrome/Edge on localhost or HTTPS.");
        return;
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "Robo_Rex" }], // tweak if needed
        optionalServices: [NUS_SERVICE_UUID],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      const tx = await service.getCharacteristic(NUS_TX_UUID);
      const rx = await service.getCharacteristic(NUS_RX_UUID);

      await rx.startNotifications();
      rx.addEventListener("characteristicvaluechanged", (e) => {
        const dv = e.target?.value || new DataView(new ArrayBuffer(0));
        const msg = new TextDecoder().decode(dv);
        pushLog(`ESP32 ▶ ${msg.trim()}`);
      });

      device.addEventListener("gattserverdisconnected", (evt) => {
        setConnected(false);
        pushLog(`BLE: disconnected (${evt?.target?.name || "device"})`);
        // Clean up globals on disconnect
        try { delete window.bluetoothSend; } catch {}
        try { delete window.rexSendJson; } catch {}
      });

      deviceRef.current = device;
      serverRef.current = server;
      txRef.current = tx;
      rxRef.current = rx;

      // --- Global send shim so UI/modules can transmit without prop drilling ---
      // Accepts string or object (object is JSON-stringified). Appends newline.
      window.bluetoothSend = async function send(lineOrObj) {
        if (!txRef.current) throw new Error("Not connected");
        const line = typeof lineOrObj === "string" ? lineOrObj : JSON.stringify(lineOrObj);
        const enc = new TextEncoder();
        const bytes = enc.encode(line.endsWith("\n") ? line : line + "\n");
        const CHUNK = 18; // keep under typical 20B MTU
        for (let i = 0; i < bytes.length; i += CHUNK) {
          await txRef.current.writeValue(bytes.slice(i, i + CHUNK));
        }
      };
      // Convenience helper for DevTools
      window.rexSendJson = async (obj) => window.bluetoothSend(obj);

      setConnected(true);
      pushLog("BLE: connected");
    } catch (err) {
      pushLog(`Connect error: ${err?.message || err}`);
      try { delete window.bluetoothSend; } catch {}
      try { delete window.rexSendJson; } catch {}
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectBLE() {
    try { await rxRef.current?.stopNotifications(); } catch {}
    try { await serverRef.current?.disconnect(); } catch {}
    deviceRef.current = serverRef.current = txRef.current = rxRef.current = null;
    try { delete window.bluetoothSend; } catch {}
    try { delete window.rexSendJson; } catch {}
    setConnected(false);
    pushLog("BLE: disconnected");
  }

  // Back-compat shim in case other modules expect a `port` prop
  const port = useMemo(() => {
    async function sendLine(line) {
      await window.bluetoothSend(line);
    }
    async function sendJson(obj) {
      return window.bluetoothSend(obj);
    }
    return { write: sendLine, writeLine: sendLine, send: sendLine, sendJson };
  }, []);

  useEffect(() => {
    const handler = () => {
      try { serverRef.current?.disconnect(); } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Robo Rex Controller (BLE)</h1>
        {!connected ? (
          <button onClick={connectBLE} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect BLE"}
          </button>
        ) : (
          <button onClick={disconnectBLE}>Disconnect</button>
        )}
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 6,
            background: connected ? "#c6f6d5" : "#fed7d7",
            border: "1px solid",
            borderColor: connected ? "#38a169" : "#e53e3e",
            color: connected ? "#22543d" : "#742a2a",
            fontSize: 12,
          }}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </header>

      <hr style={{ margin: "12px 0" }} />

      {connected ? (
        // Controller_Panel doesn't require `port` but we pass for compatibility
        <ControllerPanel port={port} />
      ) : (
        <p>
          Click <b>Connect BLE</b> to pair with your ESP32‑S3. (Chrome/Edge, localhost/HTTPS required)
        </p>
      )}

      <section style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Device Log</h3>
        <div
          style={{
            background: "#0b1020",
            color: "#c9d1d9",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
            fontSize: 12,
            padding: 12,
            borderRadius: 8,
            height: 180,
            overflow: "auto",
            border: "1px solid #22283a",
          }}
        >
          {log.length === 0 ? (
            <div style={{ opacity: 0.6 }}>No output yet…</div>
          ) : (
            log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </section>
    </div>
  );
}
