// src/ControllerPanel.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ControllerPanel.css";
import { sendCommand as bleSendCommand } from "./modules/ble/bleClient"; // adjust path if needed

/**
 * Four‑panel T‑Rex Controller (always visible)
 * Fixed quadrants:
 *   TL: Legs/Pelvis | TR: Head/Neck
 *   BL: Tail/Spine  | BR: Full Body
 *
 * - Edge arrows on screen bounds (◀ ▶ ▲ ▼)
 * - Select a panel to enable only its valid directions
 * - Hold arrows: sends {target, command, phase:'start'|'hold'|'stop'} over BLE
 * - While holding, the selected panel shows its “active” GIF
 * - Logs the exact TX string to the console even when BLE is disconnected
 */

const PANELS = [
  { id: "legsPelvis", title: "Legs / Pelvis", pos: "tl" },
  { id: "headNeck",   title: "Head / Neck",   pos: "tr" },
  { id: "tailSpine",  title: "Tail / Spine",  pos: "bl" },
  { id: "fullBody",   title: "Full Body",     pos: "br" },
];

// Per‑panel command mapping.
// For Legs/Pelvis, map arrows to movement verbs.
const commandMap = {
  legsPelvis: {
    up: "move_forward",
    down: "move_backward",
    left: "move_left",
    right: "move_right",
  },
  headNeck: { up: "up", down: "down", left: "left", right: "right" },
  tailSpine: { up: "up", down: "down", left: "left", right: "right" },
  fullBody: { up: "up", down: "down", left: "left", right: "right" },
};

export default function ControllerPanel({ connected = false, onSend }) {
  const [selection, setSelection] = useState("tailSpine");
  const [activeDir, setActiveDir] = useState(null); // 'left' | 'right' | 'up' | 'down' | null
  const timerRef = useRef(null);

  // Which directions each subsystem supports
  const capability = useMemo(
    () => ({
      legsPelvis: { left: true, right: true, up: true,  down: true  },
      headNeck:   { left: true, right: true, up: true,  down: true  },
      tailSpine:  { left: true, right: true, up: false, down: false },
      fullBody:   { left: true, right: true, up: true,  down: true  },
    }),
    []
  );

  // GIFs (put files under /public/gifs/* or change paths here)
  const gifs = useMemo(
    () => ({
      legsPelvis: { idle: "/gifs/legs-idle.gif", active: "/gifs/legs-active.gif" },
      headNeck:   { idle: "/gifs/head-idle.gif", active: "/gifs/head-active.gif" },
      tailSpine:  { idle: "/gifs/tail-idle.gif", active: "/gifs/tail-active.gif" },
      fullBody:   { idle: "/gifs/body-idle.gif", active: "/gifs/body-active.gif" },
    }),
    []
  );

  // Transport (BLE by default; can be overridden by prop)
  const send = useCallback(
    (target, command, phase) =>
      (onSend ? onSend : bleSendCommand)(target, command, phase),
    [onSend]
  );

  // Build the exact line/string we would transmit
  const buildLine = useCallback((target, command, phase) => {
    return JSON.stringify({ target, command, phase });
  }, []);

  const logTx = useCallback(
    (target, command, phase) => {
      const line = buildLine(target, command, phase);
      if (connected) {
        console.log(`[TX] ${line}`);
      } else {
        console.log(`[TX PREVIEW] ${line} (not connected)`);
      }
      return line;
    },
    [connected, buildLine]
  );

  // Hold-to-repeat
  const repeatIntervalMs = 140;
  const isAnimating = Boolean(activeDir);

  const startHold = useCallback(
    (dir) => {
      // Respect per-panel capabilities; allow preview logging regardless of BLE connection
      if (!capability[selection][dir]) return;

      const command = commandMap[selection]?.[dir] || dir;

      setActiveDir(dir);

      // Log and (if connected) send 'start'
      logTx(selection, command, "start");
      if (connected) send(selection, command, "start");

      // Log and (if connected) send 'hold' while pressed
      timerRef.current = setInterval(() => {
        logTx(selection, command, "hold");
        if (connected) send(selection, command, "hold");
      }, repeatIntervalMs);
    },
    [capability, selection, connected, send, logTx]
  );

  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (activeDir) {
      const command = commandMap[selection]?.[activeDir] || activeDir;
      logTx(selection, command, "stop");
      if (connected) send(selection, command, "stop");
    }
    setActiveDir(null);
  }, [activeDir, selection, connected, send, logTx]);

  // Cancel on release/unmount
  useEffect(() => {
    const cancel = () => stopHold();
    window.addEventListener("mouseup", cancel);
    window.addEventListener("touchend", cancel);
    window.addEventListener("touchcancel", cancel);
    return () => {
      window.removeEventListener("mouseup", cancel);
      window.removeEventListener("touchend", cancel);
      window.removeEventListener("touchcancel", cancel);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopHold]);

  // Fixed quadrant placement
  const posStyle = (pos) => {
    switch (pos) {
      case "tl": return { gridRow: 1, gridColumn: 1 };
      case "tr": return { gridRow: 1, gridColumn: 2 };
      case "bl": return { gridRow: 2, gridColumn: 1 };
      case "br": return { gridRow: 2, gridColumn: 2 };
      default:   return {};
    }
  };

  function Arrow({ dir, label }) {
    const allowed = capability[selection][dir];
    // Buttons remain clickable even when disconnected to allow preview logging
    const active = activeDir === dir;
    const classes = [
      "rex-edgeBtn",
      `rex-edgeBtn--${dir}`,
      allowed ? "rex-edgeBtn--on" : "rex-edgeBtn--off",
      active ? "rex-edgeBtn--active" : "",
    ].join(" ");
    return (
      <button
        type="button"
        aria-label={label}
        className={classes}
        disabled={!allowed}               // disable only when the selection doesn't support that direction
        title={connected ? "" : "Not connected – preview only"}
        onMouseDown={() => startHold(dir)}
        onTouchStart={(e) => { e.preventDefault(); startHold(dir); }}
      >
        {label}
      </button>
    );
  }

  function Panel({ id, title, pos }) {
    const selected = selection === id;
    const src = selected && isAnimating ? gifs[id].active : gifs[id].idle;
    return (
      <button
        type="button"
        className={["rex-panel", selected ? "rex-panel--selected" : ""].join(" ")}
        style={posStyle(pos)}
        onClick={() => setSelection(id)}
      >
        <div className="rex-panel__title">{title}</div>

        <div className="rex-panel__chips">
          {["up", "down", "left", "right"].map((d) => (
            <span
              key={d}
              className={[
                "rex-chip",
                capability[id][d] ? "rex-chip--on" : "rex-chip--off",
              ].join(" ")}
              title={commandMap[id]?.[d] || d}
            >
              {d[0].toUpperCase()}
            </span>
          ))}
        </div>

        <div className="rex-panel__imgWrap">
          <img
            src={src}
            alt={`${title} ${selected && isAnimating ? "active" : "idle"}`}
            className="rex-panel__img"
            draggable={false}
          />
        </div>
      </button>
    );
  }

  return (
    <div className="rex-root">
      {/* Edge arrows */}
      <Arrow dir="left" label="◀" />
      <Arrow dir="right" label="▶" />
      <Arrow dir="up" label="▲" />
      <Arrow dir="down" label="▼" />

      {/* 2x2 grid in fixed quadrants */}
      <div className="rex-gridWrap">
        <div className="rex-grid2x2">
          {PANELS.map((p) => (
            <Panel key={p.id} id={p.id} title={p.title} pos={p.pos} />
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="rex-status">
        <span>Selected: <strong>{titleFor(selection)}</strong></span>
        <span className="rex-dot">•</span>
        <span>Direction: <strong>{activeDir || "–"}</strong></span>
        {!connected && (
          <>
            <span className="rex-dot">•</span>
            <span>Preview only (not connected)</span>
          </>
        )}
      </div>
    </div>
  );
}

function titleFor(id) {
  switch (id) {
    case "legsPelvis": return "Legs / Pelvis";
    case "headNeck":   return "Head / Neck";
    case "tailSpine":  return "Tail / Spine";
    case "fullBody":   return "Full Body";
    default:           return id;
  }
}
