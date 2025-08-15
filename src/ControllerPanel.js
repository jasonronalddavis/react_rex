// src/ControllerPanel.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ControllerPanel.css";
// Flexible import: use whatever bleClient you already have
import * as BLE from "./modules/ble/bleClient";

/**
 * Four‑panel T‑Rex Controller (always visible)
 * Panels:
 *  - Legs/Pelvis: toggle Legs | Pelvis
 *  - Head/Neck:   toggle Head | Neck
 *  - Tail/Spine:  toggle Tail | Spine
 *  - Full Body:   (no sub-toggle, all 4 directions)
 *
 * - Edge arrows on screen bounds (◀ ▶ ▲ ▼)
 * - Select a panel & sub‑part; only valid directions are enabled
 * - Hold arrows: logs exact ESP `cmd` string + sends over BLE (if connected)
 */

const PANELS = [
  { id: "legsPelvis", title: "Legs / Pelvis", pos: "tl", subs: ["legs", "pelvis"] },
  { id: "headNeck",   title: "Head / Neck",   pos: "tr", subs: ["head", "neck"] },
  { id: "tailSpine",  title: "Tail / Spine",  pos: "bl", subs: ["tail", "spine"] },
  { id: "fullBody",   title: "Full Body",     pos: "br", subs: ["full"] },
];

/** Which directions are allowed for each sub‑part */
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

// ---------------- ESP command mapping ----------------
//
// Build the packet the ESP expects (CommandRouter.cpp).
// We also console.log a concise string for debugging.
//
function buildEspPacket(panelId, sub, dir, phase) {
  // Legs
  if (panelId === "legsPelvis" && sub === "legs") {
    const dirToCmd = {
      up: "rex_walk_forward",
      down: "rex_walk_backward",
      left: "rex_turn_left",
      right: "rex_turn_right",
    };
    const cmd = dirToCmd[dir];
    if (!cmd) return null;
    return phase === "stop" ? { cmd: "rex_stop" } : { cmd };
  }

  // Pelvis (level setpoints)
  if (panelId === "legsPelvis" && sub === "pelvis") {
    let level = 0.5; // neutral
    if (phase !== "stop") {
      if (dir === "up") level = 0.6;
      else if (dir === "down") level = 0.4;
      else return null;
    }
    return { cmd: "rex_pelvis_set", level };
  }

  // Spine
  if (panelId === "tailSpine" && sub === "spine") {
    const dirToCmd = { up: "rex_spine_up", down: "rex_spine_down" };
    const cmd = dirToCmd[dir];
    if (!cmd) return null;
    return { cmd }; // stop = just stop sending
  }

  // Tail (level setpoints)
  if (panelId === "tailSpine" && sub === "tail") {
    // left -> 1.0, right -> 0.0; stop -> 0.5 neutral
    let level = 0.5;
    if (phase !== "stop") {
      if (dir === "left") level = 1.0;
      else if (dir === "right") level = 0.0;
      else return null;
    }
    return { cmd: "rex_tail_set", level };
  }

  // Neck (requires router entries rex_neck_left/right)
  if (panelId === "headNeck" && sub === "neck") {
    const dirToCmd = { left: "rex_neck_left", right: "rex_neck_right" };
    const cmd = dirToCmd[dir];
    if (!cmd) return null;
    return { cmd };
  }

  // Head (requires router entries rex_head_up/down, or map to nod)
  if (panelId === "headNeck" && sub === "head") {
    const dirToCmd = { up: "rex_head_up", down: "rex_head_down" };
    const cmd = dirToCmd[dir];
    if (!cmd) return null;
    return { cmd };
  }

  // Full body
  if (panelId === "fullBody" && sub === "full") {
    const dirToCmd = {
      up: "rex_walk_forward",
      down: "rex_walk_backward",
      left: "rex_turn_left",
      right: "rex_turn_right",
    };
    const cmd = dirToCmd[dir];
    if (!cmd) return null;
    return phase === "stop" ? { cmd: "rex_stop" } : { cmd };
  }

  return null;
}

export default function ControllerPanel({ connected = false }) {
  const [selection, setSelection] = useState("tailSpine"); // active panel
  const [subSelection, setSubSelection] = useState({
    legsPelvis: "legs",
    headNeck: "head",
    tailSpine: "tail",
    fullBody: "full",
  });

  const [activeDir, setActiveDir] = useState(null); // 'left'|'right'|'up'|'down'|null
  const timerRef = useRef(null);

  // Transport plumbing (be tolerant of whatever bleClient exposes)
  const sendOverBLE = useCallback(async (obj) => {
    try {
      if (typeof BLE.sendJson === "function")       return BLE.sendJson(obj);
      if (typeof BLE.sendString === "function")     return BLE.sendString(JSON.stringify(obj));
      if (typeof BLE.sendCommand === "function") {
        // If your sendCommand(target, direction, phase) exists, we still prefer JSON here:
        return BLE.sendString(JSON.stringify(obj));
      }
      if (typeof window !== "undefined" && typeof window.bluetoothSend === "function") {
        return window.bluetoothSend(obj); // App.js shim
      }
      console.warn("BLE transport not found — logging only:", obj);
    } catch (err) {
      console.warn("BLE send error:", err);
    }
  }, []);

  // GIFs (swap with your real assets in /public/gifs/*)
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

  // Helpers
  const repeatIntervalMs = 140;
  const isAnimating = Boolean(activeDir);
  const currentSub = subSelection[selection];
  const isAllowed = useCallback(
    (panelId, sub, dir) => Boolean(allowedBySub[panelId]?.[sub]?.[dir]),
    []
  );

  // -------- Hold-to-repeat pipeline (builds ESP packet + logs + sends) --------
  const startHold = useCallback(
    (dir) => {
      const sub = currentSub;
      if (!isAllowed(selection, sub, dir)) return;

      const pkt = buildEspPacket(selection, sub, dir, "start");
      if (!pkt) return;

      setActiveDir(dir);

      // Log concise string and full JSON
      console.log(`[CMD start] ${pkt.cmd}${pkt.level !== undefined ? ` level=${pkt.level.toFixed(2)}` : ""}`);
      console.log("[ESP JSON]", pkt);

      if (connected) sendOverBLE(pkt);

      timerRef.current = setInterval(() => {
        const holdPkt = buildEspPacket(selection, sub, dir, "hold") || pkt;
        console.log(`[CMD hold] ${holdPkt.cmd}${holdPkt.level !== undefined ? ` level=${holdPkt.level.toFixed(2)}` : ""}`);
        if (connected) sendOverBLE(holdPkt);
      }, repeatIntervalMs);
    },
    [selection, currentSub, isAllowed, connected, sendOverBLE]
  );

  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (activeDir) {
      const sub = currentSub;
      const stopPkt = buildEspPacket(selection, sub, activeDir, "stop");
      if (stopPkt) {
        console.log(`[CMD stop] ${stopPkt.cmd}${stopPkt.level !== undefined ? ` level=${stopPkt.level.toFixed(2)}` : ""}`);
        if (connected) sendOverBLE(stopPkt);
      }
    }
    setActiveDir(null);
  }, [activeDir, selection, currentSub, connected, sendOverBLE]);

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
              title={d}
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
      {/* Edge arrows */}
      <Arrow dir="left" label="◀" />
      <Arrow dir="right" label="▶" />
      <Arrow dir="up" label="▲" />
      <Arrow dir="down" label="▼" />

      {/* 2x2 grid */}
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
