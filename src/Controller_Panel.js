// src/Controller_Panel.js
// src/Controller_Panel.js
import { useMemo, useState } from "react";
import { roar } from "./modules/Head_Function";
import { mouthUp, mouthDown, mouthSet } from "./modules/Mouth_Function.js";

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
import { spineUp, spineDown, spineSet } from "./modules/Spine_Function";
import { pelvisUp, pelvisDown, adjustPelvis } from "./modules/Pelvis_Function";
import {
  tailLeft,
  tailRight,
  tailCenter,
  tailWag,
  tailSet,
} from "./modules/Tail_Function";
import {
  neckLeft,
  neckRight,
  neckCenter,
  neckYawSet,
} from "./modules/Neck_Function";

export default function Controller_Panel({ port }) {
  // UI state
  const [speed, setSpeed] = useState(0.7);       // 0..1
  const [strideVal, setStrideVal] = useState(0.6); // 0..1
  const [lift, setLift] = useState(0.4);         // 0..1
  const [turnRate, setTurnRate] = useState(0.6); // 0..1
  const [posture, setPostureVal] = useState(0.5);// 0..1
  const [spineLevel, setSpineLevel] = useState(0.5); // 0..1
  const [tailLevel, setTailLevel] = useState(0.5);   // 0..1
  const [neckLevel, setNeckLevel] = useState(0.5);   // 0..1
  const [log, setLog] = useState([]);
  const [mouthLevel, setMouthLevel] = useState(0.0); // 0 closed, 1 open

  const disabled = !port;

  const pushLog = (msg) =>
    setLog((l) => [...l.slice(-200), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  async function doAction(label, fn) {
    try {
      if (!port) {
        pushLog(`❌ ${label}: not connected`);
        return;
      }
      pushLog(`▶ ${label}`);
      await fn();
      pushLog(`✅ ${label} done`);
    } catch (err) {
      pushLog(`💥 ${label} error: ${err?.message || err}`);
      // eslint-disable-next-line no-console
      console.error(label, err);
    }
  }

  // Handy clamp
  const clamp01 = useMemo(() => (v) => Math.max(0, Math.min(1, Number(v))), []);

  return (
    <div style={styles.wrapper}>
      <div style={styles.row}>
        <Badge connected={!disabled} />
        <h2 style={{ margin: 0 }}>Controller</h2>
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
              const val = clamp01(v);
              setSpeed(val);
              // live update gait on change
              doAction("Set Gait (speed)", () =>
                setGait(port, { speed: val, stride: strideVal, lift, mode: "walk" })
              );
            }}
          />
          <LabeledSlider
            label={`Turn Rate: ${turnRate.toFixed(2)}`}
            value={turnRate}
            onChange={(v) => setTurnRate(clamp01(v))}
          />
          <LabeledSlider
            label={`Stride: ${strideVal.toFixed(2)}`}
            value={strideVal}
            onChange={(v) => {
              const val = clamp01(v);
              setStrideVal(val);
              doAction("Set Stride", () => setStride(port, val));
            }}
          />
          <LabeledSlider
            label={`Lift: ${lift.toFixed(2)}`}
            value={lift}
            onChange={(v) => {
              const val = clamp01(v);
              setLift(val);
              doAction("Set Gait (lift)", () =>
                setGait(port, { speed, stride: strideVal, lift: val, mode: "walk" })
              );
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
          <button
            disabled={disabled}
            onClick={() =>
              doAction("Set Gait (run)", () =>
                setGait(port, { speed: 1.2, stride: 0.5, lift: 0.3, mode: "run" })
              )
            }
          >
            Quick Run Preset
          </button>
        </div>
      </Section>

      {/* Spine & Pelvis */}
      <Section title="Spine & Pelvis">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Spine Up", () => spineUp(port))}>
            Spine ↑
          </button>
          <button disabled={disabled} onClick={() => doAction("Spine Down", () => spineDown(port))}>
            Spine ↓
          </button>
          <button disabled={disabled} onClick={() => doAction("Pelvis Up", () => pelvisUp(port))}>
            Pelvis ↑
          </button>
          <button disabled={disabled} onClick={() => doAction("Pelvis Down", () => pelvisDown(port))}>
            Pelvis ↓
          </button>
        </div>

        <div style={styles.sliderCol}>
          <LabeledSlider
            label={`Spine Level: ${spineLevel.toFixed(2)}`}
            value={spineLevel}
            onChange={(v) => {
              const val = clamp01(v);
              setSpineLevel(val);
              doAction("Spine Set", () => spineSet(port, val));
            }}
          />
          <LabeledSlider
            label={`Posture: ${posture.toFixed(2)}`}
            value={posture}
            onChange={(v) => {
              const val = clamp01(v);
              setPostureVal(val);
              doAction("Set Posture", () => setPosture(port, val));
              doAction("Adjust Pelvis", () => adjustPelvis(port, val));
            }}
          />
        </div>
      </Section>

      {/* Tail */}
      <Section title="Tail">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Tail Left", () => tailLeft(port))}>
            ◀ Left
          </button>
          <button disabled={disabled} onClick={() => doAction("Tail Center", () => tailCenter(port))}>
            ⦿ Center
          </button>
          <button disabled={disabled} onClick={() => doAction("Tail Right", () => tailRight(port))}>
            Right ▶
          </button>
          <button disabled={disabled} onClick={() => doAction("Tail Wag", () => tailWag(port))}>
            Wag 🐾
          </button>
        </div>

        <LabeledSlider
          label={`Tail Level: ${tailLevel.toFixed(2)}`}
          value={tailLevel}
          onChange={(v) => {
            const val = clamp01(v);
            setTailLevel(val);
            doAction("Tail Set", () => tailSet(port, val));
          }}
        />
      </Section>

      {/* Neck */}
      <Section title="Neck">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Neck Left", () => neckLeft(port))}>
            ◀ Left
          </button>
          <button disabled={disabled} onClick={() => doAction("Neck Center", () => neckCenter(port))}>
            ⦿ Center
          </button>
          <button disabled={disabled} onClick={() => doAction("Neck Right", () => neckRight(port))}>
            Right ▶
          </button>
        </div>

        <LabeledSlider
          label={`Neck Yaw: ${neckLevel.toFixed(2)}`}
          value={neckLevel}
          onChange={(v) => {
            const val = clamp01(v);
            setNeckLevel(val);
            doAction("Neck Yaw Set", () => neckYawSet(port, val));
          }}
        />
      </Section>
<Section title="Mouth">
  <div style={styles.btnRow}>
    <button disabled={disabled} onClick={() => doAction("Mouth Open", () => mouthUp(port))}>
      Open ⬆
    </button>
    <button disabled={disabled} onClick={() => doAction("Mouth Close", () => mouthDown(port))}>
      Close ⬇
    </button>
  </div>

  {/* Optional slider if your firmware implements rex_mouth_set */}
  <LabeledSlider
    label={`Mouth Level`}
    value={mouthLevel}
    onChange={(v) => {
      const val = clamp01(v);
      setMouthLevel(val);
      doAction("Mouth Set", () => mouthSet(port, val));
    }}
  />
</Section>

      {/* Head */}
      <Section title="Head">
        <div style={styles.btnRow}>
          <button disabled={disabled} onClick={() => doAction("Roar", () => roar(port))}>
            Roar 🦖
          </button>
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
      <span style={{ width: 160 }}>{label}</span>
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
  logBox: {
    background: "#0b1020",
    color: "#c9d1d9",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    padding: 12,
    borderRadius: 8,
    height: 180,
    overflow: "auto",
    border: "1px solid #22283a",
  },
};
