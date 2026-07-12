import { OffthreadVideo, interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS } from "./tokens";

// Renders a REAL on-disk video clip (`props.src`, an absolute path pre-validated against the
// project media allowlist). Uses `<OffthreadVideo>` (frame-accurate extraction, no <video> element
// autoplay/seek races) rather than `<Video>` — the standard Remotion recommendation for anything
// rendered server-side. Same bare-absolute-path technique as Image.tsx (see that file's note).
//
// `props.startFrom` (frames into the source clip) lets a beat start mid-clip. `props.muted`
// defaults to true (most demo clips are silent B-roll composited under a VO/music track; set
// `props.muted:false` explicitly to keep the clip's own audio). Same framing polish as Image.tsx —
// radius/border/shadow — so a raw screen capture reads as "designed", not pasted in.

export const Video: React.FC<PrimitiveProps> = ({ props, frame, fps, width, opacity, blur, position, enter }) => {
  const src = typeof props.src === "string" ? props.src : "";
  const radius = typeof props.radius === "number" ? props.radius : 12;
  const startFrom = typeof props.startFrom === "number" ? Math.max(0, Math.round(props.startFrom)) : 0;
  const muted = props.muted === false ? false : true;
  const boxW = typeof props.width === "number" ? props.width * width : width * 0.5;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 16, mass: 0.8 } });
  const animOpacity = p;
  const scale = interpolate(p, [0, 1], [0.92, 1]);

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
      <OffthreadVideo src={src} startFrom={startFrom} muted={muted} style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
};
