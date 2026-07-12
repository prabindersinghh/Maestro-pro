import { interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { tokenColor, TOKENS } from "./tokens";

// Gold/white hairline rules that DRAW IN (grow from 0 -> full width/height) rather than appear
// instantly — small detail that reinforces "physics on entrances" (critique #5) and gives beats a
// designed frame instead of a floating text block. `props.orientation` picks horizontal/vertical,
// `props.length` (0..1, fraction of width/height) sets the drawn length, `props.color` a brand
// token or hex (defaults to the brand gold hairline).

export const Hairline: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, position, enter }) => {
  const orientation = props.orientation === "vertical" ? "vertical" : "horizontal";
  const color = props.color ? tokenColor(String(props.color)) : TOKENS.gold;
  const lengthFrac = typeof props.length === "number" ? props.length : 0.16;
  const thickness = typeof props.thickness === "number" ? props.thickness : 2;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 18, mass: 0.6 } });
  const draw = interpolate(p, [0, 1], [0, 1]);

  const fullLen = orientation === "horizontal" ? width * lengthFrac : height * lengthFrac;
  const drawnLen = fullLen * draw;

  const boxW = orientation === "horizontal" ? drawnLen : thickness;
  const boxH = orientation === "horizontal" ? thickness : drawnLen;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        width: boxW,
        height: boxH,
        background: color,
        boxShadow: `0 0 12px ${color}`,
        opacity: opacity * interpolate(p, [0, 1], [0, 1]),
        transform: "translate(-50%, -50%)",
        borderRadius: thickness,
      }}
    />
  );
};
