import type { PrimitiveProps } from "./types";
import { tokenColor, TOKENS } from "./tokens";

// Drifting constellation atmosphere — nodes gently drifting with connecting gold/white lines,
// same motif as the landing page's constellation mesh + HeroDemo's ambient feel. This is the
// "atmosphere everywhere" fix (binding critique #4): every beat can carry a `particles` layer so
// backgrounds never sit flat/static even before camera motion is added.
//
// Deterministic pseudo-random layout (seeded by index) so renders are stable frame-to-frame and
// reproducible across re-renders — no Math.random() at render time.

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface Node {
  x: number; // 0..1
  y: number; // 0..1
  driftX: number;
  driftY: number;
  phase: number;
  r: number;
}

function buildNodes(count: number): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const rx = seededRandom(i * 3.1 + 1);
    const ry = seededRandom(i * 7.7 + 2);
    nodes.push({
      x: rx,
      y: ry,
      driftX: (seededRandom(i * 5.3 + 3) - 0.5) * 0.06,
      driftY: (seededRandom(i * 9.1 + 4) - 0.5) * 0.06,
      phase: seededRandom(i * 2.2 + 5) * Math.PI * 2,
      r: 1.4 + seededRandom(i * 4.4 + 6) * 2.2,
    });
  }
  return nodes;
}

const NODE_COUNT_DEFAULT = 22;
const LINK_DIST = 0.22; // connect nodes within this normalized distance

export const Particles: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity }) => {
  const accent = props.accent ? tokenColor(String(props.accent)) : TOKENS.gold;
  const count = typeof props.count === "number" ? Math.round(props.count) : NODE_COUNT_DEFAULT;
  const nodes = buildNodes(Math.max(4, Math.min(60, count)));
  const t = frame / fps;

  const positioned = nodes.map((n) => {
    const dx = Math.sin(t * 0.6 + n.phase) * n.driftX;
    const dy = Math.cos(t * 0.5 + n.phase) * n.driftY;
    return { ...n, px: (n.x + dx) * width, py: (n.y + dy) * height };
  });

  const lines: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i];
      const b = positioned[j];
      const ddx = (a.px - b.px) / width;
      const ddy = (a.py - b.py) / height;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < LINK_DIST) {
        lines.push({ x1: a.px, y1: a.py, x2: b.px, y2: b.py, o: 1 - dist / LINK_DIST });
      }
    }
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, opacity }}
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={accent}
          strokeWidth={1}
          opacity={l.o * 0.35}
        />
      ))}
      {positioned.map((n, i) => {
        const twinkle = 0.5 + 0.5 * Math.sin(t * 1.4 + n.phase * 3);
        return (
          <circle
            key={i}
            cx={n.px}
            cy={n.py}
            r={n.r}
            fill={i % 4 === 0 ? TOKENS.ink : accent}
            opacity={0.35 + twinkle * 0.5}
          />
        );
      })}
    </svg>
  );
};
