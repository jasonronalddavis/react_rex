// src/App.js
import { useEffect, useRef, useState } from "react";
import ControllerPanel from "./ControllerPanel";

// Use the centralized BLE client used by the controller
import {
  connect as bleConnect,
  disconnect as bleDisconnect,
  onMessage as bleOnMessage,
  onDisconnect as bleOnDisconnect,
  isConnected as bleIsConnected,
} from "./modules/ble/bleClient";

/**
 * App: shows BLE connect/disconnect + device log
 * The 4‑pane Controller is ALWAYS visible; when not connected,
 * its arrows are disabled (ControllerPanel receives `connected`).
 */
export default function App() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [log, setLog] = useState([]);

  const unsubMsgRef = useRef(null);
  const unsubDiscRef = useRef(null);

  const pushLog = (line) =>
    setLog((l) => [
      ...l.slice(-200),
      `[${new Date().toLocaleTimeString()}] ${line}`,
    ]);

  async function connectBLE() {
    if (connecting || bleIsConnected()) return;
    try {
      setConnecting(true);
      if (!("bluetooth" in navigator)) {
        alert("Web Bluetooth not supported. Use Chrome/Edge on localhost or HTTPS.");
        return;
      }

      await bleConnect({ namePrefix: "Robo_Rex" });
      setConnected(true);
      pushLog("BLE: connected");

      // Subscribe to incoming messages
      unsubMsgRef.current?.();
      unsubMsgRef.current = bleOnMessage((text) => {
        if (text) pushLog(`ESP32 ▶ ${text}`);
      });

      // Update UI when device disconnects
      unsubDiscRef.current?.();
      unsubDiscRef.current = bleOnDisconnect(() => {
        setConnected(false);
        pushLog("BLE: disconnected");
      });
    } catch (err) {
      pushLog(`Connect error: ${err?.message || String(err)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectBLE() {
    try {
      await bleDisconnect();
    } catch (e) {
      // ignore
    } finally {
      setConnected(false);
      pushLog("BLE: disconnected");
      // Clean up subscriptions
      try { unsubMsgRef.current?.(); } catch {}
      try { unsubDiscRef.current?.(); } catch {}
      unsubMsgRef.current = null;
      unsubDiscRef.current = null;
    }
  }

  // On refresh/close, try to disconnect cleanly
  useEffect(() => {
    const handler = () => { try { bleDisconnect(); } catch {} };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // If something else connected earlier (HMR), reflect it
  useEffect(() => {
    setConnected(bleIsConnected());
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

      {/* Controller is ALWAYS visible; it self-disables controls when disconnected */}
      <ControllerPanel connected={connected} />

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
