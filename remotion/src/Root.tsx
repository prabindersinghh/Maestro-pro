import { Composition } from "remotion";
import { AnimatedIntro } from "./compositions/AnimatedIntro";
import { KaestralLaunch } from "./compositions/KaestralLaunch";
import { LogoReveal } from "./compositions/LogoReveal";
import { DataViz } from "./compositions/DataViz";
import { Transition } from "./compositions/Transition";
import { HeroDemo } from "./compositions/HeroDemo";
import { CondenseReel } from "./compositions/CondenseReel";
import { FilmLaunch } from "./compositions/FilmLaunch";
import { FilmSaaS } from "./compositions/FilmSaaS";
import { FilmData } from "./compositions/FilmData";
import { Generative, totalDuration, dimsForAspect, type GenerativeProps } from "./compositions/Generative";

const FPS = 30;
const W = 1920;
const H = 1080;

// durationInFrames comes from the `durationSeconds` prop at render time.
const dur = ({ props }: { props: { durationSeconds?: number } }) => ({
  durationInFrames: Math.max(1, Math.round((props.durationSeconds ?? 4) * FPS)),
});

// Minimal valid SceneSpec used only as defaultProps for the Studio preview / composition list —
// real renders always pass an explicit `spec` validated by `validateSceneSpec` (src/gen/sceneSpec.ts).
const MINIMAL_SPEC: GenerativeProps["spec"] = {
  meta: { aspect: "16:9", fps: FPS },
  beats: [
    {
      durationInFrames: 60,
      background: { kind: "glow", accent: "#16b16a" },
      layers: [
        {
          element: "text",
          props: { text: "Kaestral" },
          position: { x: 0.5, y: 0.5 },
          opacity: 1,
          blur: 0,
          style: { role: "display", size: 0.1 },
          enter: { anim: "spring", easing: "ease-out", delay: 0, from: "below", snapToBeat: false },
        },
      ],
    },
  ],
};

// durationInFrames + width/height derive from the SceneSpec itself (sum of beats' durations,
// meta.aspect -> pixel dims) rather than a flat `durationSeconds` prop, since a Generative render
// carries an arbitrary number of variable-length beats.
const generativeMetadata = ({ props }: { props: GenerativeProps }) => {
  const { width, height } = dimsForAspect(props.spec.meta.aspect);
  return {
    durationInFrames: Math.max(1, totalDuration(props.spec)),
    width,
    height,
    fps: props.spec.meta.fps,
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HeroDemo" component={HeroDemo} fps={FPS} width={W} height={H} durationInFrames={300}
      defaultProps={{ accent: "#16b16a", durationSeconds: 10 }}
      calculateMetadata={dur}
    />
    <Composition
      id="CondenseReel" component={CondenseReel} fps={FPS} width={1080} height={1920} durationInFrames={300}
      defaultProps={{ accent: "#16b16a", durationSeconds: 10 }}
      calculateMetadata={dur}
    />
    {/* Bespoke hand-authored films (Task 10 final): raw Remotion, no preset system. */}
    <Composition
      id="FilmLaunch" component={FilmLaunch} fps={FPS} width={W} height={H} durationInFrames={390}
      defaultProps={{ durationSeconds: 13 }}
      calculateMetadata={dur}
    />
    <Composition
      id="FilmSaaS" component={FilmSaaS} fps={FPS} width={W} height={H} durationInFrames={420}
      defaultProps={{ durationSeconds: 14 }}
      calculateMetadata={dur}
    />
    <Composition
      id="FilmData" component={FilmData} fps={FPS} width={1080} height={1920} durationInFrames={372}
      defaultProps={{ durationSeconds: 12.4 }}
      calculateMetadata={dur}
    />
    <Composition
      id="KaestralLaunch" component={KaestralLaunch} fps={FPS} width={W} height={H} durationInFrames={1800}
      defaultProps={{ durationSeconds: 60 }}
      calculateMetadata={dur}
    />
    <Composition
      id="AnimatedIntro" component={AnimatedIntro} fps={FPS} width={W} height={H} durationInFrames={120}
      defaultProps={{ title: "Kaestral", subtitle: "motion graphics", accent: "#1db26b", durationSeconds: 4 }}
      calculateMetadata={dur}
    />
    <Composition
      id="LogoReveal" component={LogoReveal} fps={FPS} width={W} height={H} durationInFrames={110}
      defaultProps={{ title: "MAESTRO", accent: "#5b8cff", durationSeconds: 3.5 }}
      calculateMetadata={dur}
    />
    <Composition
      id="DataViz" component={DataViz} fps={FPS} width={W} height={H} durationInFrames={150}
      defaultProps={{ title: "Growth", accent: "#1db26b", bars: undefined as never, durationSeconds: 5 }}
      calculateMetadata={dur}
    />
    <Composition
      id="Transition" component={Transition} fps={FPS} width={W} height={H} durationInFrames={30}
      defaultProps={{ accent: "#1db26b", label: undefined as never, durationSeconds: 1 }}
      calculateMetadata={dur}
    />
    <Composition
      id="Generative" component={Generative} fps={FPS} width={W} height={H} durationInFrames={60}
      defaultProps={{ spec: MINIMAL_SPEC }}
      calculateMetadata={generativeMetadata}
    />
  </>
);
