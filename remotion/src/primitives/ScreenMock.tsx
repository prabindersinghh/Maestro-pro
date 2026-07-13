import { Img, interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS } from "./tokens";

// THE primitive for "show the product working" (binding critique #7): a browser/app window chrome
// — traffic-light dots, a URL bar (`props.url`), dark instrument-panel chrome matching HeroDemo's
// command-bar look (rgba(18,17,22,0.92) fill, white hairline border, deep drop shadow, mono type)
// — wrapping a content area. If `props.src` is given, the real screenshot renders inside via the
// same bare-absolute-path `<Img>` technique as Image.tsx. Spring entrance (scale+translateY
// overshoot, never a hard cut), matching the rest of the primitive layer's physics.

const CHROME_BG = "rgba(18,17,22,0.92)";
const BAR_BG = "rgba(255,255,255,0.05)";

export const ScreenMock: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, position, enter }) => {
  const src = typeof props.src === "string" ? props.src : "";
  const url = typeof props.url === "string" ? props.url : "";
  const boxW = typeof props.width === "number" ? props.width * width : width * 0.56;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 15, mass: 0.8 } });
  const animOpacity = p;
  const translateY = interpolate(p, [0, 1], [26, 0]);
  const scale = interpolate(p, [0, 1], [0.94, 1]);

  const chromeH = Math.round(boxW * 0.072);
  const contentAspect = 9 / 16; // default content-area aspect if no image loaded yet (16:10-ish window)

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        width: boxW,
        maxHeight: height * 0.78, // never overflow the frame, whatever the screenshot's aspect
        opacity: opacity * animOpacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${scale})`,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${TOKENS.white}`,
        boxShadow: "0 40px 120px -20px rgba(0,0,0,0.8), 0 4px 18px rgba(0,0,0,0.45)",
        background: TOKENS.black,
      }}
    >
      {/* chrome bar: traffic-light dots + URL pill */}
      <div
        style={{
          height: chromeH,
          minHeight: 34,
          background: CHROME_BG,
          borderBottom: `1px solid ${TOKENS.white}`,
          display: "flex",
          alignItems: "center",
          gap: chromeH * 0.4,
          padding: `0 ${chromeH * 0.55}px`,
        }}
      >
        <div style={{ display: "flex", gap: chromeH * 0.22, flex: "none" }}>
          <div style={{ width: chromeH * 0.28, height: chromeH * 0.28, borderRadius: "50%", background: "#e5484d" }} />
          <div style={{ width: chromeH * 0.28, height: chromeH * 0.28, borderRadius: "50%", background: "#f0b429" }} />
          <div style={{ width: chromeH * 0.28, height: chromeH * 0.28, borderRadius: "50%", background: TOKENS.green }} />
        </div>
        {url && (
          <div
            style={{
              flex: 1,
              background: BAR_BG,
              borderRadius: chromeH * 0.35,
              height: chromeH * 0.56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: TOKENS.fontMono,
              fontSize: Math.max(11, chromeH * 0.34),
              color: TOKENS.ink2,
              letterSpacing: 0.3,
            }}
          >
            {url}
          </div>
        )}
      </div>

      {/* content area */}
      <div style={{ position: "relative", width: "100%", aspectRatio: src ? undefined : `${1 / contentAspect}`, lineHeight: 0, background: TOKENS.slate2 }}>
        {src ? (
          <Img src={src} style={{ display: "block", width: "100%", height: "auto" }} />
        ) : (
          <div style={{ width: "100%", paddingTop: `${contentAspect * 100}%` }} />
        )}
      </div>
    </div>
  );
};
