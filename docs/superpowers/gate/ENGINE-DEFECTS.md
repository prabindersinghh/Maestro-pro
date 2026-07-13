# Engine defects — why generated films are ~60% of hero-demo (Task 10 second FAIL)

The bar is `landing/assets/hero-demo.mp4` (hand-authored HeroDemo.tsx). Generated films are ~60% of
it. The fix is the ENGINE, not the specs — if the agent's compositions land badly, the
interpreter/primitives have systematic defects. The engine must make ugly HARD to produce.

## Root-cause diff (hero-demo vs generated), by mechanism

### A. NO LAYOUT SYSTEM (biggest failure — "alignment & placement")
- `position {x,y}` is raw normalized coords. No safe-area margins, no baseline grid, no optical
  centering, no snapping. The agent guesses coordinates → elements land a few px wrong every time →
  reads amateur.
- HeroDemo optically centers on one axis with tight, fixed line relationships (paired lines
  marginTop 6px, underline a fixed height*0.02 below). Generated specs scatter x=0.3/0.34/0.58 with
  no relationship → floating elements in dead space.
- FIX: interpreter-level layout. (1) Clamp every element into a safe area (≈6% margins; 9:16 caption
  band respects lower-third). (2) Optical-centering correction for text (caps-height baseline nudge,
  not raw bounding-box translate(-50%,-50%)). (3) A snap-to-grid / anchor system so an author's
  `y:0.3` resolves to a sensible baseline-grid row, not a raw pixel. (4) Auto-stack: multiple
  centered text layers on the same anchor get consistent vertical rhythm automatically.

### B. NO HOLD / SETTLE — everything always moving ("pacing" + "premiumness")
- HeroDemo springs a beat's content in over ~15 frames, then HOLDS STILL ~50 frames. The eye rests.
- Generated beats stagger 3-4 entrances (delay 8/20/34...) across the WHOLE beat → something is
  always moving → nothing settles → not premium. Fixed mechanical pulse.
- FIX: the interpreter enforces a settle. Entrances complete in the FIRST ~40% of a beat; the last
  ~50%+ is held still (only ambient glow/grid/particles keep breathing). Cap per-beat entrance
  spread so staggers can't smear across the whole beat. Give the beat a "hold tail".

### C. OVER-ANIMATION / NO RESTRAINT ("restraint")
- HeroDemo beat = 2 text lines + underline + glow + grid. That's it.
- Generated beats = camera + transition + particles + hairline + 3-4 foreground + often
  lightingSweep + motionBlur. Too many simultaneous moves fight the composition.
- FIX: dial back defaults. Ambient particles default opacity 0.5 → ~0.14 (HeroDemo grid is 0.10).
  Default camera amount gentler. Don't stack motionBlur + rack + parallax by default. Fewer, better.

### D. FINISH — "the few pixels off" ("quality/finish")
- translate(-50%,-50%) centers the bounding box; caps text sits optically low (asymmetric
  ascender/descender). HeroDemo compensates with baseline/marginTop.
- Ambient particles/backgrounds too loud (0.5) vs hero (grid 0.10, glow peak ~0.27).
- FIX: optical baseline correction in Text/Counter/TextOnPath. Tone all ambient layers to
  hero-demo levels. Match glow peak (~0.27) and grid opacity (0.10 → the primitive already uses 0.5
  AbsoluteFill * per-instance; verify the composited result matches hero).

### E. EASING — verify curves match
- HeroDemo: spring {damping:15, mass default} for text; bezier(0.22,0.61,0.16,1) for draws. Text
  primitive already matches. Confirm NO primitive uses a linear/cheap curve for a hero move, and the
  spring settle timing matches hero (translateY 22→0, not 40→0 except deliberate kinetic).

## Also: SaaS demo showed a FAKE green-gradient screenshot
- FIX: use the real Kaestral UI capture at public/kaestral-ui.png (1280×800, real editor) in the
  ScreenMock, not the sample gradient.

## Pass bar
AT hero-demo quality, not 60%, not 90%. Controller self-judges frame-by-frame against
hero-demo.mp4 and does NOT show the user until it's AT the bar. "Close enough" = keep going.
