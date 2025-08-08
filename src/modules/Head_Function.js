export function roar(port) {
  if (!port) return;
  const writer = port.writable.getWriter();
  writer.write(new TextEncoder().encode("rex_roar\n"));
  writer.releaseLock();
}
