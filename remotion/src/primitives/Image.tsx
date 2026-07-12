import { Img, interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS } from "./tokens";

// Renders a REAL on-disk image (`props.src`, an absolute path already validated against the
// project's media allowlist by `validateSceneSpec` — see src/gen/sceneSpec.ts). This is one of the
// "SHOW THE PRODUCT" primitives (binding critique #7): the film composites actual screenshots, not
// words about the product.
//
// Path technique: Remotion's <Img> accepts a plain absolute filesystem path directly as `src` when
// rendering server-side (no staticFile()/HTTP round-trip needed) — Chromium resolves a bare
// Windows/POSIX absolute path against the local filesystem for `<img>`/`<video>` the same way a
// `file://` URL would. Verified by self-check render (see task report): the sample screenshot
// composited correctly with a bare absolute `src`, so no `file://` prefix is applied here — adding
// one on Windows (`file:///C:/...`) is the fallback if a given Chromium/OS combination refuses the
// bare-path form.
//
// Reveal: fade + spring scale-in (never a hard cut), optional slow parallax drift
// (`props.parallax`, 0..1 fraction of width, default off), rounded corners (`props.radius`,
// default 12), a subtle white hairline border + deep shadow — matches the "framed, not floating"
// treatment used across HeroDemo/CondenseReel's chrome.

export const Image: React.FC<PrimitiveProps> = ({ props, frame, fps, width, opacity, blur, position, enter }) => {
  const src = typeof props.src === "string" ? props.src : "";
  const radius = typeof props.radius === "number" ? props.radius : 12;
  const parallax = typeof props.parallax === "number" ? Math.max(0, Math.min(1, props.parallax)) : 0;
  const boxW = typeof props.width === "number" ? props.width * width : width * 0.5;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 16, mass: 0.8 } });
  const animOpacity = p;
  const scale = interpolate(p, [0, 1], [0.92, 1]);

  const driftPx = parallax > 0 ? interpolate(frame, [0, fps * 8], [0, width * 0.04 * parallax], { extrapolateRight: "extend" }) : 0;

  if (!src) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        width: boxW,
        opacity: opacity * animOpacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        transform: `translate(-50%, -50%) scale(${scale})`,
        borderRadius: radius,
        overflow: "hidden",
        border: `1px solid ${TOKENS.white}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 4px 18px rgba(0,0,0,0.4)",
        lineHeight: 0,
      }}
    >
      <Img
        src={src}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          transform: `translateX(${driftPx}px) scale(1.06)`,
        }}
      />
    </div>
  );
};
