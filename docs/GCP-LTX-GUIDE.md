# Run LTX-2 on your own Google Cloud GPU (with your $300 credits)

This is the plain-language guide to generating video clips on a Google Cloud GPU and having them land
straight on the Maestro timeline. You do the Google Cloud parts once; after that it's click **Start
GPU** → generate → click **Stop GPU**.

**The one thing to know up front:** Google's free trial gives you $300 in credits **but blocks GPUs
until you upgrade to a paid account.** Upgrading does *not* charge your card — it just unlocks GPUs,
and your $300 is still spent first. So step 1 is the upgrade.

---

## The money math (so you're not nervous)

- Recommended GPU: **NVIDIA L4** on a **`g2-standard-8`** VM, **Spot** pricing, region **us-central1**.
- Cost: **~$0.30–0.43 per GPU-hour** (Spot). It makes roughly **7–8 clips per hour** (5-second clips).
- That's **~$0.04–0.06 per clip** — a nickel.
- **Your 600 clips ≈ $32.** About **11% of your $300.** You are not going to run out of credit
  generating; you'd have ~$268 left for retries and higher quality.
- Worst realistic case (L4 much slower, lots of retries): still only ~$120.

> These speed numbers are **estimates** — nobody has published exact L4 timings for LTX-2. Step 8
> below is "generate one real clip and time it." Trust *that* number, not this table.

**The real risk isn't per-clip cost — it's leaving the GPU running by accident.** A forgotten GPU
bills ~$0.85–3.67/hour doing nothing. That's why there are **four** independent stop-guards (below).

---

## Part A — Google Cloud setup (you do this once, ~30–60 min mostly waiting)

Do these in order. Each is one action.

1. **Upgrade to a paid account.** Console → Billing → **Activate full account / Upgrade**.
   *(Unlocks GPUs. Doesn't charge you — your $300 is used first.)*

2. **Set a budget alert.** Billing → Budgets & alerts → create a budget at **$300** with email alerts
   at 50 / 90 / 100%. *(A safety email. Note: it warns, it does not stop spending.)*

3. **Enable the Compute Engine API.** APIs & Services → search "Compute Engine API" → **Enable**.
   Wait 1–5 minutes. *(Nothing else works until this is on.)*

4. **Request GPU quota.** IAM & Admin → Quotas → request **two** things:
   - `GPUs (all regions)` = **1** (Global)
   - `NVIDIA L4 GPUs` = **1** (region us-central1)

   Justification: *"single L4 for self-hosted open-source LTX-2 video inference, start/stop as needed."*
   *(New accounts start at 0. Approval is often minutes, sometimes a day.)*

5. **Wait for the approval email.** Confirm the quota shows **≥ 1** before continuing.
   *(VM creation silently fails until this lands.)*

6. **Create the VM.** Compute Engine → Create instance → GPUs tab:
   - GPU: **NVIDIA L4**, machine type **g2-standard-8**
   - Region/zone: **us-central1-a** (try -b/-c/-f if a zone is full)
   - Provisioning model: **Spot** (≈65% cheaper)
   - Boot disk: a **Deep Learning / CUDA** image, **100 GB** (caches the model so restarts are fast)
   - Under "Advanced" add these so GCP enforces stop-guards even if everything else fails:
     - Access scope: **Allow full access to all Cloud APIs** (so the VM can stop itself)
     - Set **`--max-run-duration=4h`** and **`--instance-termination-action=STOP`**

   *(If you prefer the command line, the equivalent `gcloud` create command is at the bottom.)*

7. **Install the LTX server on the VM.** SSH into it (the "SSH" button in the console), then:
   ```bash
   git clone <your Maestro repo>            # or copy the cloud/ltx-vm/ folder up to the VM
   cd cloud/ltx-vm
   bash setup.sh                            # installs the server + the idle watchdog
   ```
   Then do the one manual bit `setup.sh` prints: clone LTX-2, download the
   **`ltx-2.3-22b-distilled-1.1`** checkpoint to `/opt/ltx`, and wire `load_pipeline()` + `_run_job()`
   in `ltx_server.py` to call the real pipeline. Set your **shared secret token** in the service file.

8. **Generate one real test clip and time it.** From the VM, run a single 5-second 720p clip with
   `--quantization fp8-cast` (add `--offload cpu` if it runs out of memory). Note how long it took and
   whether it looks good. **This measured time is your real cost/speed number.**

9. **Turn on the server + guards, then stop the VM.**
   ```bash
   sudo systemctl start maestro-ltx && curl localhost:8000/health   # should say ok
   # idle watchdog is already enabled by setup.sh
   sudo shutdown -h now      # or click Stop — billing stops within seconds
   ```

## Part B — Connect Maestro (one time)

1. Open **Generate** in Maestro → provider **My GPU (LTX)**.
2. Paste the **shared secret** (the same token you set on the VM) → **Save**.
3. Fill in **Project ID**, **Zone** (`us-central1-a`), **Instance** (`ltx-gpu`), **Port** (`8000`).
4. Install the **Google Cloud CLI** on your PC and run `gcloud auth login` once. *(Maestro uses it to
   start/stop the VM for you.)*

## Part C — Daily use (the loop)

1. Click **▶ Start GPU** — Maestro boots the VM and waits until it's ready (~2–4 min the first time).
2. Type a prompt → **Generate**. The clip renders on the GPU and **drops onto your timeline**. Repeat
   for as many clips as you want — the GPU stays warm.
3. Click **■ Stop GPU** when you're done. **Billing stops.**

---

## The four stop-guards (why you won't burn credits)

In order of trust — each catches a failure the one above it might miss:

1. **On-VM idle watchdog (primary).** A script on the VM checks every 5 min; if the GPU has been idle
   **15 minutes**, the VM **stops itself**. This fires even if Maestro crashes, your laptop sleeps, or
   your Wi-Fi drops mid-batch. It doesn't depend on your PC at all.
2. **GCP max-run-duration (4h).** Set at VM creation — Google force-stops the VM 4 hours after each
   boot, even if the watchdog wedges.
3. **Nightly force-stop (optional).** A schedule that stops the VM at 23:00 to catch an overnight session:
   ```bash
   gcloud compute resource-policies create instance-schedule nightly-stop \
     --region=us-central1 --vm-stop-schedule='0 23 * * *' --timezone='America/Toronto'
   gcloud compute instances add-resource-policies ltx-gpu --zone=us-central1-a --resource-policies=nightly-stop
   ```
4. **Budget alert (email).** From Part A step 2 — warns you at 50/90/100%.

**Habit that makes all of this moot:** click **Stop GPU** when you finish. The guards are the safety net.

---

## Appendix — the `gcloud` create command (if you skip the console form)

```bash
gcloud compute instances create ltx-gpu \
  --project=YOUR_PROJECT --zone=us-central1-a \
  --machine-type=g2-standard-8 \
  --accelerator=type=nvidia-l4,count=1 \
  --provisioning-model=SPOT --instance-termination-action=STOP --max-run-duration=4h \
  --image-family=common-cu124 --image-project=deeplearning-platform-release \
  --boot-disk-size=100GB --boot-disk-type=pd-balanced \
  --scopes=cloud-platform
```

## Honest limits

- LTX generation is a **paid-tier feature later** — this is you testing capability on free credits now.
- The `ltx_server.py` inference call is a **placeholder you wire to the real LTX-2 pipeline** (the repo's
  pipeline API changes; the wrapper is intentionally thin). Everything around it — the API, the job
  queue, the activity stamp, the idle watchdog, and the Maestro integration — is done.
- Speed/VRAM for LTX-2 on an L4 is **not officially published**; step 8 (one real clip) is how you
  confirm it before committing to 600.
