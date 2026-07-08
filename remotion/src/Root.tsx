import { Composition } from "remotion";
import { AnimatedIntro } from "./compositions/AnimatedIntro";
import { MaestroLaunch } from "./compositions/MaestroLaunch";
import { LogoReveal } from "./compositions/LogoReveal";
import { DataViz } from "./compositions/DataViz";
import { Transition } from "./compositions/Transition";

const FPS = 30;
const W = 1920;
const H = 1080;

// durationInFrames comes from the `durationSeconds` prop at render time.
const dur = ({ props }: { props: { durationSeconds?: number } }) => ({
  durationInFrames: Math.max(1, Math.round((props.durationSeconds ?? 4) * FPS)),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MaestroLaunch" component={MaestroLaunch} fps={FPS} width={W} height={H} durationInFrames={1800}
      defaultProps={{ durationSeconds: 60 }}
      calculateMetadata={dur}
    />
    <Composition
      id="AnimatedIntro" component={AnimatedIntro} fps={FPS} width={W} height={H} durationInFrames={120}
      defaultProps={{ title: "Maestro", subtitle: "motion graphics", accent: "#1db26b", durationSeconds: 4 }}
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
  </>
);
