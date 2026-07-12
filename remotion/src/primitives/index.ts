import type { PrimitiveProps } from "./types";
import { Text } from "./Text";
import { Shape } from "./Shape";
import { Grid } from "./Grid";
import { GlowField } from "./GlowField";
import { LogoMark } from "./LogoMark";
import { Particles } from "./Particles";
import { Hairline } from "./Hairline";
import { Waveform } from "./Waveform";
import { Timeline } from "./Timeline";
import { CaptionKaraoke } from "./CaptionKaraoke";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { AreaChart } from "./AreaChart";
import { Counter } from "./Counter";
import { Image } from "./Image";
import { Video } from "./Video";
import { ScreenMock } from "./ScreenMock";
import { Arrow } from "./Arrow";
import { HighlightBox } from "./HighlightBox";
import { PointerLine } from "./PointerLine";
import { SpotlightDim } from "./SpotlightDim";

export { Particles, Hairline };
export { Waveform, Timeline, CaptionKaraoke, BarChart, LineChart, AreaChart, Counter };
export { Image, Video, ScreenMock, Arrow, HighlightBox, PointerLine, SpotlightDim };
export { Camera, DEFAULT_CAMERA, cameraTransform, parallaxOffset, rackBlurFor } from "./Camera";
export type { CameraSpec } from "./Camera";
export { applyTransition, TRANSITION_FRAMES } from "./Transitions";
export type { TransitionKind, TransitionStyles } from "./Transitions";

// Re-exported for beat-level background rendering (BG_KINDS "grid"/"glow" in sceneSpec.ts) —
// consumed directly by Generative.tsx in a later task, not addressed by a SceneSpec element name
// themselves. `gridLayout` (a *layout* element that nests child layers, see Task 9's
// GridLayout.tsx) is unrelated to this `Grid` backdrop primitive and must not be conflated with it.
export { Grid, GlowField };

// The primitive registry — maps every SceneSpec element name (see `src/gen/sceneSpec.ts`'s
// `ELEMENTS`) to a renderer component. Real element primitives so far: Text/Shape/LogoMark (the
// latter as `logo`), plus Hairline (`hairline`) and Particles (`particles`) added in Task 6 for
// atmosphere. Grid/GlowField remain background-only (BG_KINDS, not ELEMENTS) and are not element
// entries. The rest are `Noop` placeholders until later tasks implement them. Every element
// MUST have an entry — a missing key would mean a validated SceneSpec layer silently renders
// nothing, which violates "fail loud, never silent-substitute" in spirit even though Noop
// itself renders nothing on purpose as an explicit, visible placeholder.
//
// TASK 7 UPGRADE — "show the product working" (binding critique #7): waveform/timeline/
// captionKaraoke (editor motifs, ported from CondenseReel.tsx/HeroDemo.tsx) plus barChart/
// lineChart/areaChart/counter (data-story primitives) now render real content instead of Noop.
//
// TASK 8 UPGRADE — MEDIA (video/image/screenMock) + CALLOUT (arrow/highlightBox/pointerLine/
// spotlightDim) primitives now render real content instead of Noop. These let a generated film
// show the ACTUAL product (screenshots/clips framed in device chrome) with "look here" annotations
// — the other half of "show the product working" alongside Task 7's editor motifs. `props.src`
// on video/image/screenMock is pre-validated against the project's media allowlist by
// `validateSceneSpec` (src/gen/sceneSpec.ts) before it ever reaches these primitives.

/** Renders nothing. Placeholder for elements not yet implemented as primitives. */
export const Noop: React.FC<PrimitiveProps> = () => null;

export const REGISTRY: Record<string, React.FC<PrimitiveProps>> = {
  text: Text,
  textOnPath: Noop,
  video: Video,
  image: Image,
  screenMock: ScreenMock,
  waveform: Waveform,
  timeline: Timeline,
  logo: LogoMark,
  shape: Shape,
  hairline: Hairline,
  barChart: BarChart,
  lineChart: LineChart,
  areaChart: AreaChart,
  counter: Counter,
  captionKaraoke: CaptionKaraoke,
  particles: Particles,
  arrow: Arrow,
  highlightBox: HighlightBox,
  pointerLine: PointerLine,
  spotlightDim: SpotlightDim,
  splitLayout: Noop,
  gridLayout: Noop,
  countdown: Noop,
};
