export function walkForward(port) {
  send(port, "rex_walk_forward");
}

export function turnLeft(port) {
  send(port, "rex_turn_left");
}

export function turnRight(port) {
  send(port, "rex_turn_right");
}

function send(port, command) {
  if (!port) return;
  const writer = port.writable.getWriter();
  writer.write(new TextEncoder().encode(command + "\n"));
  writer.releaseLock();
}
