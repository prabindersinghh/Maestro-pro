import { interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";

// Dims the whole frame EXCEPT a circular or rect region — draws attention to whatever's underneath
// (typically a ScreenMock/Image region an Arrow/HighlightBox is also pointing at). Two shapes:
//   - `props.shape: "rect"` with `props.rect` ({x,y,w,h} normalized) — uses a CSS mask-image with a
//     radial punched hole isn't rectangular-friendly, so rect uses `mask-image` built from a
//     conic/linear compositing trick via multiple box-shadows is overkill; instead rect uses an
//     SVG mask (a full-frame rect with a rounded-rect hole cut via mask="url(#hole)") for a crisp
//     edge with a soft feather.
//   - default "circle" with `props.center` ({x,y} normalized) + `props.radius` (fraction of the
//     smaller frame dimension) — the classic spotlight punch — via `box-shadow` with a huge spread
//     ("boxShadow trick"): a transparent circle whose spread-out shadow fills the rest of the frame,
//     no SVG needed, and it composites cheaply.
// Animates in: dim opacity + hole radius both spring/ease in rather than snapping to full dim
// instantly, matching this primitive layer's "everything overshoots/settles" physics rule.

export const SpotlightDim: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, enter }) => {
  const shape = props.shape === "rect" ? "rect" : "circle";
  const dimAmount = typeof props.dim === "number" ? Math.max(0, Math.min(1, props.dim)) : 0.72;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 18, mass: 0.8 } });
  const dimIn = interpolate(p, [0, 1], [0, dimAmount]);

  if (shape === "rect") {
    const rectRaw = props.rect;
    const o = rectRaw && typeof rectRaw === "object" && !Array.isArray(rectRaw) ? (rectRaw as Record<string, unknown>) : {};
    const rx = (typeof o.x === "number" ? o.x : 0.3) * width;
    const ry = (typeof o.y === "number" ? o.y : 0.3) * height;
    const rw = (typeof o.w === "number" ? o.w : 0.4) * width;
    const rh = (typeof o.h === "number" ? o.h : 0.25) * height;
    const feather = 24;
    const maskId = "spotlight-rect-hole";

    return (
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", left: 0, top: 0, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      >
        <defs>
          <mask id={maskId}>
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <defs>
              <radialGradient id="rect-feather" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="black" />
                <stop offset="100%" stopColor="white" />
              </radialGradient>
            </defs>
            <rect x={rx - feather} y={ry - feather} width={rw + feather * 2} height={rh + feather * 2} rx={16} ry={16} fill="black" />
          </mask>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill={`rgba(0,0,0,${dimIn})`} mask={`url(#${maskId})`} opacity={opacity} />
      </svg>
    );
  }

  const centerRaw = props.center;
  const c = centerRaw && typeof centerRaw === "object" && !Array.isArray(centerRaw) ? (centerRaw as Record<string, unknown>) : {};
  const cx = (typeof c.x === "number" ? c.x : 0.5) * width;
  const cy = (typeof c.y === "number" ? c.y : 0.5) * height;
  const radiusFrac = typeof props.radius === "number" ? props.radius : 0.16;
  const minDim = Math.min(width, height);
  const holeRadius = interpolate(p, [0, 1], [minDim * radiusFrac * 1.4, minDim * radiusFrac]);

  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        width: 1,
        height: 1,
        borderRadius: "50%",
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        // Spread a huge, near-opaque shadow from a nearly-invisible circle — everything beyond the
        // circle's edge gets covered by the shadow's spread, punching a soft-edged hole at the
        // circle itself. Classic CSS "spotlight" trick, no SVG/mask-image needed.
        boxShadow: `0 0 0 ${Math.max(minDim, minDim * 2)}px rgba(0,0,0,${dimIn})`,
        transform: `translate(-50%, -50%) scale(${holeRadius})`,
      }}
    />
  );
};
