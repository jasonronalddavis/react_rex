// src/ControllerPanel.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ControllerPanel.css";
// Be flexible about the BLE client API that's available in your repo:
import * as BLE from "./modules/ble/bleClient"; // supports sendCommand / sendJson / sendString

/**
 * Four‑panel T‑Rex Controller (always visible)
 * Panels:
 *  - Legs/Pelvis: toggle Legs | Pelvis
 *  - Head/Neck:   toggle Head | Neck
 *  - Tail/Spine:  toggle Tail | Spine
 *  - Full Body:   (no sub-toggle, all 4 directions)
 *
 * - Edge arrows on screen bounds (◀ ▶ ▲ ▼)
 * - Select a panel & sub‑part; only its valid directions are enabled
 * - Hold arrows: logs the exact JSON and (if connected + transport present) transmits over BLE
 */

const PANELS = [
  { id: "legsPelvis", title: "Legs / Pelvis", pos: "tl", subs: ["legs", "pelvis"] },
  { id: "headNeck",   title: "Head / Neck",   pos: "tr", subs: ["head", "neck"] },
  { id: "tailSpine",  title: "Tail / Spine",  pos: "bl", subs: ["tail", "spine"] },
  { id: "fullBody",   title: "Full Body",     pos: "br", subs: ["full"] },
];

/** Allowed directions by sub‑part */
const allowedBySub = {
  legsPelvis: {
    legs:   { up: true,  down: true,  left: true,  right: true  },
    pelvis: { up: true,  down: true,  left: false, right: false },
  },
  headNeck: {
    head: { up: true,  down: true,  left: false, right: false },
    neck: { up: false, down: false, left: true,  right: true  },
  },
  tailSpine: {
    tail:  { up: false, down: false, left: true,  right: true  },
    spine: { up: true,  down: true,  left: false, right: false },
  },
  fullBody: {
    full: { up: true, down: true, left: true, right: true },
  },
};

/** Command strings by sub‑part + direction */
const commandBySub = {
  legsPelvis: {
    legs:   { up: "move_forward",  down: "move_backward", left: "move_left",   right: "move_right" },
    pelvis: { up: "pelvis_up",     down: "pelvis_down" },
  },
  headNeck: {
    head: { up: "head_up",  down: "head_down" },
    neck: { left: "neck_left", right: "neck_right" },
  },
  tailSpine: {
    tail:  { left: "tail_left",  right: "tail_right" },
    spine: { up: "spine_up",     down: "spine_down"  },
  },
  fullBody: {
    full: { up: "up", down: "down", left: "left", right: "right" },
  },
};

export default function ControllerPanel({ connected = false }) {
  const [selection, setSelection] = useState("tailSpine"); // which panel is active
  const [subSelection, setSubSelection] = useState({
    legsPelvis: "legs",
    headNeck: "head",
    tailSpine: "tail",
    fullBody: "full",
  });

  const [activeDir, setActiveDir] = useState(null); // 'left'|'right'|'up'|'down'|null
  const timerRef = useRef(null);

  // ---------- Transport plumbing ----------
  const sendOverBLE = useCallback(async (payloadObj) => {
    // Try the most specific function first, then graceful fallbacks.
    try {
      if (typeof BLE.sendCommand === "function") {
        // Expected signature: (target, command, phase)
        await BLE.sendCommand(payloadObj.target, payloadObj.command, payloadObj.phase);
        return;
      }
      const jsonLine = JSON.stringify(payloadObj);
      if (typeof BLE.sendJson === "function") {
        await BLE.sendJson(payloadObj);
        return;
      }
      if (typeof BLE.sendString === "function") {
        await BLE.sendString(jsonLine);
        return;
      }
      if (typeof window !== "undefined" && typeof window.bluetoothSend === "function") {
        await window.bluetoothSend(payloadObj); // App.js shim accepts objects or strings
        return;
      }
      console.warn("BLE transport not found — logging only.");
    } catch (err) {
      console.warn("BLE send error:", err);
    }
  }, []);

  // ---------- GIFs ----------
  const gifs = useMemo(
    () => ({
      legsPelvis: {
        legs:   { idle: "/gifs/legs-idle.gif",   active: "/gifs/legs-active.gif" },
        pelvis: { idle: "/gifs/pelvis-idle.gif", active: "/gifs/pelvis-active.gif" },
        idle: "/gifs/legs-idle.gif", active: "/gifs/legs-active.gif",
      },
      headNeck: {
        head: { idle: "/gifs/head-idle.gif", active: "/gifs/head-active.gif" },
        neck: { idle: "/gifs/neck-idle.gif", active: "/gifs/neck-active.gif" },
        idle: "/gifs/head-idle.gif", active: "/gifs/head-active.gif",
      },
      tailSpine: {
        tail:  { idle: "/gifs/tail-idle.gif",  active: "/gifs/tail-active.gif" },
        spine: { idle: "/gifs/spine-idle.gif", active: "/gifs/spine-active.gif" },
        idle: "/gifs/tail-idle.gif", active: "/gifs/tail-active.gif",
      },
      fullBody: {
        full: { idle: "/gifs/body-idle.gif", active: "/gifs/body-active.gif" },
        idle: "/gifs/body-idle.gif", active: "/gifs/body-active.gif",
      },
    }),
    []
  );

  // ---------- Logging helpers ----------
  const buildLine = useCallback((target, command, phase) => {
    return JSON.stringify({ target, command, phase });
  }, []);

  const logTx = useCallback(
    (target, command, phase) => {
      const line = buildLine(target, command, phase);
      if (connected) console.log(`[TX] ${line}`);
      else console.log(`[TX PREVIEW] ${line} (not connected)`);
      return line;
    },
    [connected, buildLine]
  );

  // ---------- Hold-to-repeat ----------
  const repeatIntervalMs = 140;
  const isAnimating = Boolean(activeDir);
  const currentSub = subSelection[selection];

  const isAllowed = useCallback(
    (panelId, sub, dir) => Boolean(allowedBySub[panelId]?.[sub]?.[dir]),
    []
  );
  const resolveCommand = useCallback(
    (panelId, sub, dir) => commandBySub[panelId]?.[sub]?.[dir] || null,
    []
  );

  const startHold = useCallback(
    (dir) => {
      const sub = currentSub;
      if (!isAllowed(selection, sub, dir)) return;

      const cmd = resolveCommand(selection, sub, dir);
      if (!cmd) return;

      setActiveDir(dir);

      // Log and (if connected & transport present) transmit
      logTx(selection, cmd, "start");
      if (connected) sendOverBLE({ target: selection, command: cmd, phase: "start" });

      timerRef.current = setInterval(() => {
        logTx(selection, cmd, "hold");
        if (connected) sendOverBLE({ target: selection, command: cmd, phase: "hold" });
      }, repeatIntervalMs);
    },
    [selection, currentSub, isAllowed, resolveCommand, connected, logTx, sendOverBLE]
  );

  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (activeDir) {
      const sub = currentSub;
      const cmd = resolveCommand(selection, sub, activeDir);
      if (cmd) {
        logTx(selection, cmd, "stop");
        if (connected) sendOverBLE({ target: selection, command: cmd, phase: "stop" });
      }
    }
    setActiveDir(null);
  }, [activeDir, selection, currentSub, resolveCommand, connected, logTx, sendOverBLE]);

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

  // ---------- Layout helpers ----------
  const posStyle = (pos) => {
    switch (pos) {
      case "tl": return { gridRow: 1, gridColumn: 1 };
      case "tr": return { gridRow: 1, gridColumn: 2 };
      case "bl": return { gridRow: 2, gridColumn: 1 };
      case "br": return { gridRow: 2, gridColumn: 2 };
      default:   return {};
    }
  };

  function Tabs({ panelId, options }) {
    const current = subSelection[panelId];
    return (
      <div className="rex-tabs" onClick={(e) => e.stopPropagation()}>
        {options.map((opt) => {
          const active = current === opt;
          return (
            <button
              key={opt}
              type="button"
              className={["rex-tabs__btn", active ? "rex-tabs__btn--active" : ""].join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                setSubSelection((s) => ({ ...s, [panelId]: opt }));
              }}
            >
              {labelForSub(opt)}
            </button>
          );
        })}
      </div>
    );
  }

  function Arrow({ dir, label }) {
    // Enable/disable based on the *currently selected panel & sub*
    const allowed = isAllowed(selection, currentSub, dir);
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
        disabled={!allowed}
        title={connected ? "" : "Not connected – preview only"}
        onMouseDown={() => startHold(dir)}
        onTouchStart={(e) => { e.preventDefault(); startHold(dir); }}
      >
        {label}
      </button>
    );
  }

  function Panel({ id, title, pos, subs }) {
    const selected = selection === id;
    const sub = subSelection[id] || subs?.[0];
    const g = gifs[id]?.[sub] || gifs[id];
    const src = selected && isAnimating ? g.active : g.idle;

    const onActivate = () => setSelection(id);
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelection(id);
      }
    };

    const allowedMap = allowedBySub[id]?.[sub] ?? { up: false, down: false, left: false, right: false };

    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        className={["rex-panel", selected ? "rex-panel--selected" : ""].join(" ")}
        style={posStyle(pos)}
        onClick={onActivate}
        onKeyDown={onKey}
      >
        <div className="rex-panel__title">{title}</div>

        {/* Sub-tabs (if multiple subs exist) */}
        {subs && subs.length > 1 ? <Tabs panelId={id} options={subs} /> : null}

        {/* Capability chips reflect the currently chosen sub-part */}
        <div className="rex-panel__chips">
          {["up", "down", "left", "right"].map((d) => (
            <span
              key={d}
              className={["rex-chip", allowedMap[d] ? "rex-chip--on" : "rex-chip--off"].join(" ")}
              title={commandBySub[id]?.[sub]?.[d] || d}
            >
              {d[0].toUpperCase()}
            </span>
          ))}
        </div>

        {/* Image area */}
        <div className="rex-panel__imgWrap">
          <img
            src={src}
            alt={`${title} (${labelForSub(sub)}) ${selected && isAnimating ? "active" : "idle"}`}
            className="rex-panel__img"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rex-root">
      {/* Edge arrows (enable/disable depends on selected panel + sub) */}
      <Arrow dir="left" label="◀" />
      <Arrow dir="right" label="▶" />
      <Arrow dir="up" label="▲" />
      <Arrow dir="down" label="▼" />

      {/* 2x2 grid in fixed quadrants */}
      <div className="rex-gridWrap">
        <div className="rex-grid2x2">
          {PANELS.map((p) => (
            <Panel key={p.id} id={p.id} title={p.title} pos={p.pos} subs={p.subs} />
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="rex-status">
        <span>Selected: <strong>{titleFor(selection)}</strong></span>
        <span className="rex-dot">•</span>
        <span>Part: <strong>{labelForSub(currentSub)}</strong></span>
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

function labelForSub(sub) {
  switch (sub) {
    case "legs": return "Legs";
    case "pelvis": return "Pelvis";
    case "head": return "Head";
    case "neck": return "Neck";
    case "tail": return "Tail";
    case "spine": return "Spine";
    case "full": return "Full";
    default: return sub;
  }
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
