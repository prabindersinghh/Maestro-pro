import { useEffect, useReducer, useRef } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "../ui/theme";
import { drawFrame } from "./draw";
import { BrowserFrameSource } from "./browserFrameSource";

export function CanvasPreview() {
  useEditorVersion();
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<HTMLCanvasElement>(null);
  const fsRef = useRef<BrowserFrameSource | null>(null);
  if (!fsRef.current) {
    fsRef.current = new BrowserFrameSource(
      (mediaRef) => store.mediaSrcFor(mediaRef),
      store.timeline.fps,
      forceRender,
    );
    if (import.meta.env.DEV) (globalThis as unknown as { frameSource?: BrowserFrameSource }).frameSource = fsRef.current;
  }

  const { timeline } = store;
  const W = timeline.width;
  const H = timeline.height;
  const frame = store.view.currentFrame;
  const playing = store.view.playing;

  const paint = (f: number) => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    drawFrame(ctx, store.timeline, {
      width: W, height: H, frame: f,
      mediaName: (r) => store.media.asset(r)?.name ?? r,
      frameSource: fsRef.current ?? undefined,
    });
    fsRef.current?.sweep();
  };

  // Paused / scrubbing: repaint on each store change.
  useEffect(() => {
    if (!playing) paint(frame);
  });

  // Playing: a dedicated 60fps draw loop reads the live (real-time) video frames — smooth,
  // independent of React's per-frame re-renders.
  useEffect(() => {
    if (!playing) return;
    fsRef.current?.setPlaying(true);
    let raf = 0;
    const loop = () => {
      paint(store.view.currentFrame);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      fsRef.current?.setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <canvas
      ref={ref}
      style={{
        aspectRatio: String(W / H),
        maxHeight: "100%",
        maxWidth: "100%",
        height: "min(60vh, 100%)",
        background: "#000",
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      }}
    />
  );
}
