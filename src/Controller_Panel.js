// src/Controller_Panel.js
import { useState } from "react";

// src/Controller_Panel.js
import { useEffect, useMemo, useState } from "react";

import { roar } from "./modules/Head_Function";
import {
  walkForward,
  walkBackward,
  turnLeft,
  turnRight,
  run as runCmd,
  stop,
  setGait,
  adjustSpeed,
  setStride,
  setPosture,
} from "./modules/Leg_Function";
import { tailWag } from "./modules/Tail_Function";
import { spineUp, spineDown } from "./modules/Spine_Function";
import { adjustPelvis } from "./modules/Pelvis_Function";

// --- BLE client (NUS-like) ---
const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write (Web -> ESP)
const NUS_RX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify (ESP -> Web)

let g = { device: null, server: null, service: null, tx: null, rx: null };

async function bleConnect(namePrefix = "Robo_Rex") {
  if (!("bluetooth" in navigator)) throw new Error("Web Bluetooth not supported in this browser.");
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix }],
    optionalServices: [NUS_SERVICE_UUID],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(NUS_SERVICE_UUID);
  const tx = await service.getCharacteristic(NUS_TX_UUID);
  const rx = await service.getCharacteristic(NUS_RX_UUID);

  await rx.startNotifications();
  rx.addEventListener("characteristicvaluechanged", (e) => {
    const msg = new TextDecoder().decode(e.target.value);
    console.log("🦖 Rex → Web:", msg.trim());
  });

  device.addEventListener("gattserverdisconnected", () => {
    console.warn("🔌 BLE disconnected");
  });

  g = { device, server, service, tx, rx };
  return g;
}

async function bleDisconnect() {
  try { await g.rx?.stopNotifications(); } catch {}
  try { g.server?.disconnect(); } catch {}
  g = { device: null, server: null, service: null, tx: null, rx: null };
}

function bleIsConnected() {
  return !!(g.server && g.server.connected && g.tx);
}

async function bleSendLine(line) {
  if (!bleIsConnected()) throw new Error("Not connected");
  const data = new TextEncoder().encode(line.endsWith("\n") ? line : line + "\n");
  const CHUNK = 18; // avoid 20B MTU issues
  for (let i = 0; i < data.length; i += CHUNK) {
    await g.tx.writeValue(data.slice(i, i + CHUNK));
  }
}

async function bleSendJson(obj) {
  return bleSendLine(JSON.stringify(obj));
}

// --------- UI Component ----------
export default function Controller_Panel() {
  const [isBleConnected, setIsBleConnected] = useState(bleIsConnected());
  const [speed, setSpeed] = useState(0.7);
  const [strideVal, setStrideVal] = useState(0.6);
  const [lift, setLift] = useState(0.4);
  const [turnRate, setTurnRate] = useState(0.6);
  const [posture, setPostureVal] = useState(0.5);
  const [log, setLog] = useState([]);

  // "Port" shim so existing modules can keep using (port, ...)
  const port = useMemo(() => {
    return {
      write: bleSendLine,
      writeLine: bleSendLine,
      send: bleSendLine,
      sendJson: bleSendJson,
    };
  }, []);

  const disabled = !isBleConnected;

  const pushLog = (msg) =>
    setLog((l) => [...l.slice(-200), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  async function doAction(label, fn) {
    try {
      if (!bleIsConnected()) {
        pushLog(`❌ ${label}: not connected`);
        return;
      }
      pushLog(`▶ ${label}`);
      await fn();
      pushLog(`✅ ${label} done`);
    } catch (err) {
      pushLog(`💥 ${label} error: ${err?.message || err}`);
      console.error(label, err);
    }
  }

  async function onConnect() {
    try {
      await bleConnect("Robo_Rex");
      setIsBleConnected(true);
      pushLog("✅ BLE connected");
    } catch (e) {
      pushLog(`❌ Connect failed: ${e?.message || e}`);
    }
  }

  async function onDisconnect() {
    await bleDisconnect();
    setIsBleConnected(false);
    pushLog("🔌 BLE disconnected");
  }

  // Keep button state in sync if user unplugs
  useEffect(() => {
    const t = setInterval(() => setIsBleConnected(bleIsConnected()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={styles.wrapper}>
      <div style={styles.row}>
        <Badge connected={!disabled} />
        <h2 style={{ margin: 0 }}>Controller</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {!isBleConnected ? (
            <button onClick={onConnect} style={styles.btnPrimary}>🔗 Connect BLE</button>
          ) : (
            <button onClick={onDisconnect} style={styles.btnGray}>❌ Disconnect</button>
          )}
        </div>
      </div>

      {/* Locomotion */}
      <Section title="Locomotion">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Walk Forward", () => walkForward(port, speed))}>
            Walk ⬆
          </button>
          <button disabled={disabled} onClick={() => doAction("Walk Backward", () => walkBackward(port, speed))}>
            Back ⬇
          </button>
          <button disabled={disabled} onClick={() => doAction("Turn Left", () => turnLeft(port, turnRate))}>
            Left ⟲
          </button>
          <button disabled={disabled} onClick={() => doAction("Turn Right", () => turnRight(port, turnRate))}>
            Right ⟳
          </button>
          <button disabled={disabled} onClick={() => doAction("Run", () => runCmd(port, 1.5))}>
            Run 🏃
          </button>
          <button disabled={disabled} onClick={() => doAction("Stop", () => stop(port))}>
            Stop ⛔
          </button>
        </div>

        <div style={styles.sliderCol}>
          <LabeledSlider
            label={`Speed: ${speed.toFixed(2)}`}
            value={speed}
            onChange={(v) => {
              setSpeed(v);
              doAction("Set Gait (speed)", () => setGait(port, { speed: v, stride: strideVal, lift, mode: "walk" }));
            }}
          />
          <LabeledSlider
            label={`Turn Rate: ${turnRate.toFixed(2)}`}
            value={turnRate}
            onChange={setTurnRate}
          />
          <LabeledSlider
            label={`Stride: ${strideVal.toFixed(2)}`}
            value={strideVal}
            onChange={(v) => {
              setStrideVal(v);
              doAction("Set Stride", () => setStride(port, v));
            }}
          />
          <LabeledSlider
            label={`Lift: ${lift.toFixed(2)}`}
            value={lift}
            onChange={(v) => {
              setLift(v);
              doAction("Set Gait (lift)", () => setGait(port, { speed, stride: strideVal, lift: v, mode: "walk" }));
            }}
          />
        </div>

        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Speed +", () => adjustSpeed(port, +0.05))}>
            Speed +
          </button>
          <button disabled={disabled} onClick={() => doAction("Speed –", () => adjustSpeed(port, -0.05))}>
            Speed –
          </button>
        </div>
      </Section>

      {/* Spine / Pelvis / Tail / Head */}
      <Section title="Body">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Spine Up", () => spineUp(port))}>
            Spine ↑
          </button>
          <button disabled={disabled} onClick={() => doAction("Spine Down", () => spineDown(port))}>
            Spine ↓
          </button>

          <button disabled={disabled} onClick={() => doAction("Tail Wag", () => tailWag(port))}>
            Tail Wag 🐾
          </button>

          <button disabled={disabled} onClick={() => doAction("Roar", () => roar(port))}>
            Roar 🦖
          </button>
        </div>

        <div style={{ ...styles.sliderCol, marginTop: 8 }}>
          <LabeledSlider
            label={`Posture: ${posture.toFixed(2)}`}
            value={posture}
            onChange={(v) => {
              setPostureVal(v);
              doAction("Set Posture", () => setPosture(port, v));
              doAction("Adjust Pelvis", () => adjustPelvis(port, v));
            }}
          />
        </div>
      </Section>

      {/* Log */}
      <Section title="Log">
        <div style={styles.logBox}>
          {log.length === 0 ? (
            <div style={{ opacity: 0.6 }}>No messages yet…</div>
          ) : (
            log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </Section>
    </div>
  );
}

/* ------------------- helpers ------------------- */

function Section({ title, children }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.h3}>{title}</h3>
      {children}
    </section>
  );
}

function LabeledSlider({ label, value, onChange, min = 0, max = 1, step = 0.01 }) {
  return (
    <label style={styles.sliderRow}>
      <span style={{ width: 140 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
    </label>
  );
}

function Badge({ connected }) {
  return (
    <span
      title={connected ? "Connected" : "Disconnected"}
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: connected ? "#16a34a" : "#ef4444",
        display: "inline-block",
        marginRight: 8,
      }}
    />
  );
}

const styles = {
  wrapper: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    display: "grid",
    gap: 16,
    padding: 12,
    maxWidth: 980,
    margin: "0 auto",
  },
  row: { display: "flex", alignItems: "center", gap: 8 },
  section: {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 12,
  },
  h3: { margin: "0 0 8px 0" },
  btnRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  sliderCol: {
    display: "grid",
    gap: 8,
    marginTop: 8,
  },
  sliderRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  btnPrimary: {
    padding: "8px 12px",
    background: "#0d6efd",
    border: "none",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
  },
  btnGray: {
    padding: "8px 12px",
    background: "#444",
    border: "none",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 14,
  },
  logBox: {
    background: "#0b1020",
    color: "#c9d1d9",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    padding: 12,
    borderRadius: 8,
    height: 160,
    overflow: "auto",
    border: "1px solid #22283a",
  },
};
