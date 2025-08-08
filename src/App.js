import { useEffect, useRef, useState } from "react";
import ControllerPanel from "./Controller_Panel.js";

export default function App() {
  const [port, setPort] = useState(null);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState([]);
  const readerRef = useRef(null);

  // Append to UI log
  const pushLog = (line) => {
    setLog((l) => [...l.slice(-200), `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  // Connect to ESP32 over Web Serial
  const connect = async () => {
    try {
      if (!("serial" in navigator)) {
        alert("Web Serial not supported. Use Chrome or Edge.");
        return;
      }
      const selPort = await navigator.serial.requestPort();
      await selPort.open({ baudRate: 115200 });
      setPort(selPort);
      setConnected(true);
      pushLog("Connected.");

      // Start reader loop
      const decoder = new TextDecoder();
      const reader = selPort.readable.getReader();
      readerRef.current = reader;

      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) pushLog(decoder.decode(value));
          }
        } catch (err) {
          pushLog(`Read error: ${err.message}`);
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      })();
    } catch (err) {
      pushLog(`Connect error: ${err.message}`);
    }
  };

  // Graceful disconnect
  const disconnect = async () => {
    try {
      if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch {}
        try { readerRef.current.releaseLock(); } catch {}
        readerRef.current = null;
      }
      if (port) {
        try { await port.close(); } catch {}
      }
    } finally {
      setConnected(false);
      setPort(null);
      pushLog("Disconnected.");
    }
  };

  // Auto-cleanup on page unload
  useEffect(() => {
    const handler = () => {
      if (port) try { port.close(); } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [port]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Robo Rex Controller</h1>
        {!connected ? (
          <button onClick={connect}>Connect</button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
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
        <ControllerPanel port={port} />
      ) : (
        <p>Click <b>Connect</b> to pair with your ESP32-S3 (Chrome/Edge required).</p>
      )}

      <section style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 8 }}>Device Log</h3>
        <div
          style={{
            background: "#0b1020",
            color: "#c9d1d9",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
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

