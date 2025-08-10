// src/ControllerPanel.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ControllerPanel.css";
import { sendCommand as bleSendCommand } from "./modules/ble/bleClient";

/**
 * Four‑panel T‑Rex Controller
 * - Edge arrows on screen bounds (◀ ▶ ▲ ▼)
 * - Select a panel to enable only its valid directions
 * - Press & hold arrows: send {target, direction, phase} over BLE
 */
const PANELS = [
  { id: "legsPelvis", title: "Legs / Pelvis" },
  { id: "headNeck",   title: "Head / Neck" },
  { id: "tailSpine",  title: "Tail / Spine" },
  { id: "fullBody",   title: "Full Body" },
];

export default function ControllerPanel({ onSend }) {
  const [selection, setSelection] = useState("tailSpine");
  const [activeDir, setActiveDir] = useState(null); // 'left' | 'right' | 'up' | 'down' | null
  const timerRef = useRef(null);

  // Which directions are allowed for each subsystem
  const capability = useMemo(
    () => ({
      legsPelvis: { left: true, right: true, up: true,  down: true  },
      headNeck:   { left: true, right: true, up: true,  down: true  },
      tailSpine:  { left: true, right: true, up: false, down: false }, // lateral only
      fullBody:   { left: true, right: true, up: true,  down: true  },
    }),
    []
  );

  // Public GIF asset paths (put files under /public/gifs/*)
  const gifs = useMemo(
    () => ({
      legsPelvis: { idle: "/gifs/legs-idle.gif", active: "/gifs/legs-active.gif" },
      headNeck:   { idle: "/gifs/head-idle.gif", active: "/gifs/head-active.gif" },
      tailSpine:  { idle: "/gifs/tail-idle.gif", active: "/gifs/tail-active.gif" },
      fullBody:   { idle: "/gifs/body-idle.gif", active: "/gifs/body-active.gif" },
    }),
    []
  );

  // Sender (DI-friendly)
  const send = useCallback(
    (target, direction, phase) =>
      (onSend ? onSend : bleSendCommand)(target, direction, phase),
    [onSend]
  );

  const repeatIntervalMs = 140;
  const isAnimating = Boolean(activeDir);

  const startHold = useCallback(
    (dir) => {
      if (!capability[selection][dir]) return; // disabled arrow
      setActiveDir(dir);
      send(selection, dir, "start");
      timerRef.current = setInterval(() => send(selection, dir, "hold"), repeatIntervalMs);
    },
    [capability, selection, send]
  );

  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (activeDir) send(selection, activeDir, "stop");
    setActiveDir(null);
  }, [activeDir, selection, send]);

  // Global release listeners (mouse/touch) & cleanup
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

  function Arrow({ dir, label }) {
    const enabled = capability[selection][dir];
    const active = activeDir === dir;
    const classNames = [
      "edgeBtn",
      `edgeBtn--${dir}`,
      enabled ? "edgeBtn--on" : "edgeBtn--off",
      active ? "edgeBtn--active" : "",
    ].join(" ");
    return (
      <button
        type="button"
        aria-label={label}
        className={classNames}
        disabled={!enabled}
        onMouseDown={() => startHold(dir)}
        onTouchStart={(e) => {
          e.preventDefault();
          startHold(dir);
        }}
      >
        {label}
      </button>
    );
  }

  function Panel({ id, title }) {
    const selected = selection === id;
    const src = selected && isAnimating ? gifs[id].active : gifs[id].idle;
    return (
      <button
        type="button"
        className={["panel", selected ? "panel--selected" : ""].join(" ")}
        onClick={() => setSelection(id)}
      >
        <div className="panel__title">{title}</div>
        <div className="panel__chips">
          {["up", "down", "left", "right"].map((d) => (
            <span
              key={d}
              className={["chip", capability[id][d] ? "chip--on" : "chip--off"].join(" ")}
            >
              {d[0].toUpperCase()}
            </span>
          ))}
        </div>
        <div className="panel__imgWrap">
          <img
            src={src}
            alt={`${title} ${selected && isAnimating ? "active" : "idle"}`}
            className="panel__img"
            draggable={false}
          />
        </div>
      </button>
    );
  }

  return (
    <div className="controllerRoot">
      {/* Edge arrows */}
      <Arrow dir="left" label="◀" />
      <Arrow dir="right" label="▶" />
      <Arrow dir="up" label="▲" />
      <Arrow dir="down" label="▼" />

      {/* 2x2 grid */}
      <div className="grid">
        {PANELS.map((p) => (
          <Panel key={p.id} id={p.id} title={p.title} />
        ))}
      </div>

      {/* Footer status */}
      <div className="status">
        <span>
          Selected: <strong>{titleFor(selection)}</strong>
        </span>
        <span className="dot">•</span>
        <span>
          Direction: <strong>{activeDir || "–"}</strong>
        </span>
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
