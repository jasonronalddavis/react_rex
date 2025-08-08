import { roar } from "./modules/Head_Function";
import { walkForward, turnLeft, turnRight } from "./modules/Leg_Function";
import { tailWag } from "./modules/Tail_Function";
import { spineUp, spineDown } from "./modules/Spine_Function";
import { adjustPelvis } from "./modules/Pelvis_Function.js";

export default function ControllerPanel({ port }) {
  return (
    <div>
      <button onClick={() => walkForward(port)}>Walk Forward</button>
      <button onClick={() => turnLeft(port)}>Turn Left</button>
      <button onClick={() => turnRight(port)}>Turn Right</button>
      <button onClick={() => tailWag(port)}>Tail Wag</button>
      <button onClick={() => spineUp(port)}>Spine Up</button>
      <button onClick={() => spineDown(port)}>Spine Down</button>
      <button onClick={() => adjustPelvis(port)}>Pelvis Adjust</button>
      <button onClick={() => roar(port)}>Roar</button>
    </div>
  );
}
