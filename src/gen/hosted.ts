// Hosted AI generation (STRATEGY ③) — BYOK to Fal.ai or Replicate. Node-only (runs in the MCP
// server so both the in-app chat and Claude Code can generate). Given a prompt + params it submits
// the job, polls to completion, and returns the result media URL. The executor then downloads the
// file and imports it onto the timeline. GTX-1650-class GPUs can't run LTX/FLUX locally, so this
// runs on the provider's servers — the user pays per clip.

export type GenProvider = "fal" | "replicate";
export type GenKind = "video" | "image";

export interface GenConfig {
  provider: GenProvider;
  apiKey: string;
  videoModel: string; // e.g. fal: "fal-ai/ltx-video"   replicate: "owner/model" or a version hash
  imageModel: string; // e.g. fal: "fal-ai/flux/schnell" replicate: "black-forest-labs/flux-schnell"
}

export const DEFAULT_MODELS: Record<GenProvider, { video: string; image: string }> = {
  fal: { video: "fal-ai/ltx-video", image: "fal-ai/flux/schnell" },
  replicate: { video: "lightricks/ltx-video", image: "black-forest-labs/flux-schnell" },
};

export interface GenResult { url: string; kind: GenKind }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Submit + poll a generation job; returns the first output media URL. Throws on failure/timeout. */
export async function generate(cfg: GenConfig, kind: GenKind, prompt: string, opts: { durationSeconds?: number; aspectRatio?: string } = {}): Promise<GenResult> {
  if (!cfg.apiKey) throw new Error("No generation API key set. Add your Fal or Replicate key in Settings → Generation.");
  const url = cfg.provider === "fal" ? await runFal(cfg, kind, prompt, opts) : await runReplicate(cfg, kind, prompt, opts);
  return { url, kind };
}

// ---- Fal.ai (queue API) ----
async function runFal(cfg: GenConfig, kind: GenKind, prompt: string, opts: { durationSeconds?: number; aspectRatio?: string }): Promise<string> {
  const model = kind === "video" ? cfg.videoModel : cfg.imageModel;
  const headers = { Authorization: `Key ${cfg.apiKey}`, "Content-Type": "application/json" };
  const input: Record<string, unknown> = { prompt };
  if (kind === "video" && opts.durationSeconds) input.num_frames = Math.round(opts.durationSeconds * 24);
  if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;

  const sub = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers, body: JSON.stringify(input) });
  if (!sub.ok) throw new Error(`Fal submit ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  const { request_id } = (await sub.json()) as { request_id: string };

  const base = `https://queue.fal.run/${model.split("/").slice(0, 2).join("/")}/requests/${request_id}`;
  for (let i = 0; i < 300; i++) { // up to ~10 min
    await sleep(2000);
    const st = await (await fetch(`${base}/status`, { headers })).json() as { status: string };
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.status === "ERROR") throw new Error(`Fal job ${st.status}`);
  }
  const out = await (await fetch(base, { headers })).json() as Record<string, unknown>;
  const found = pickUrl(out);
  if (!found) throw new Error(`Fal: no output URL in result: ${JSON.stringify(out).slice(0, 300)}`);
  return found;
}

// ---- Replicate (predictions API) ----
async function runReplicate(cfg: GenConfig, kind: GenKind, prompt: string, opts: { durationSeconds?: number; aspectRatio?: string }): Promise<string> {
  const model = kind === "video" ? cfg.videoModel : cfg.imageModel;
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" };
  const input: Record<string, unknown> = { prompt };
  if (opts.aspectRatio) input.aspect_ratio = opts.aspectRatio;

  // model is "owner/name" (uses the latest version) or a bare version hash.
  const endpoint = model.includes("/") ? `https://api.replicate.com/v1/models/${model}/predictions` : "https://api.replicate.com/v1/predictions";
  const body = model.includes("/") ? { input } : { version: model, input };
  const sub = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!sub.ok) throw new Error(`Replicate submit ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  let pred = (await sub.json()) as { status: string; urls?: { get: string }; output?: unknown };

  for (let i = 0; i < 300 && pred.status !== "succeeded"; i++) {
    if (pred.status === "failed" || pred.status === "canceled") throw new Error(`Replicate job ${pred.status}`);
    await sleep(2000);
    pred = await (await fetch(pred.urls!.get, { headers })).json() as typeof pred;
  }
  const found = pickUrl(pred.output);
  if (!found) throw new Error(`Replicate: no output URL: ${JSON.stringify(pred.output).slice(0, 300)}`);
  return found;
}

/** Find the first media URL in a provider result (handles {video:{url}}, {images:[{url}]}, [url], "url"). */
function pickUrl(v: unknown): string | null {
  if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["video", "image", "url", "output", "images", "videos"]) {
      if (key in o) { const u = pickUrl(o[key]); if (u) return u; }
    }
    for (const val of Object.values(o)) { const u = pickUrl(val); if (u) return u; }
  }
  return null;
}
