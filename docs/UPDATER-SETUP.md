# Auto-updater setup (Tauri 2)

Kaestral ships with the Tauri 2 updater plugin wired end-to-end (Rust plugin registration, capability
permission, `plugins.updater` config, in-app "Check for updates" button in Settings → About). The one
thing that is **not** done for you — and cannot be, because it's a secret only you should hold — is
generating the signing keypair. Everything below is the exact sequence to finish setup and to publish
each future release.

---

## 0. Why signing is required

Tauri's updater refuses to install an update unless it's signed with a private key whose matching
public key is baked into `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). This prevents anyone
who compromises your GitHub releases from pushing a malicious update. Right now that field holds the
placeholder string `PLACEHOLDER_PUBLIC_KEY_SEE_UPDATER_SETUP_MD` — the app **will not** be able to
verify or install updates until you replace it with a real public key (step 1 below).

---

## 1. One-time key setup

Run this once, from the `palmier-win` project root:

```bash
npm run tauri signer generate -- -w ~/.tauri/kaestral-updater.key
```

- This is the Tauri 2 signer CLI (`tauri signer generate`). The `-w` flag writes the **private** key
  to `~/.tauri/kaestral-updater.key` (and a `~/.tauri/kaestral-updater.key.pub` alongside it).
- It will prompt you to set a password for the private key — choose one and store it in your password
  manager. You need it (as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, see step 3) every time you build a
  signed release.
- The command prints the **public key** to your terminal. Copy it.

**Keep `~/.tauri/kaestral-updater.key` secret.** Do not commit it, do not paste it into chat, do not
put it in the repo. Anyone with this file (+ its password) can sign malicious updates that your users'
apps will trust and auto-install. Back it up somewhere safe (e.g. a password manager's secure notes or
an encrypted vault) — if you lose it, you cannot publish further updates to existing users without
shipping them a fresh installer with a new pubkey.

### Paste the public key into the config

Open `src-tauri/tauri.conf.json` and replace the placeholder:

```jsonc
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/prabindersinghh/Kaestral-pro/releases/latest/download/latest.json"],
    "pubkey": "PLACEHOLDER_PUBLIC_KEY_SEE_UPDATER_SETUP_MD"   // <-- replace this string
  }
}
```

with the public key the signer command printed (a long base64 blob — paste it exactly, including any
`-----BEGIN...` wrapper if `tauri signer generate` includes one for your Tauri CLI version). Commit
this change — the **public** key is safe to commit; only the private key is secret.

### Set the signing env vars before building

Every `npm run tauri build` that should produce update-installable artifacts needs these two
environment variables set in the shell that runs the build:

```bash
# PowerShell
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\Users\you\.tauri\kaestral-updater.key"   # path to the file (or its raw contents)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "the password you set above"

# bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/kaestral-updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="the password you set above"
```

`TAURI_SIGNING_PRIVATE_KEY` accepts either a filesystem path to the key file, or the key's raw contents
directly (useful for CI secrets where you can't easily drop a file first). Once these are set, `tauri
build` automatically produces a `.sig` file next to each bundle target because
`bundle.createUpdaterArtifacts: true` is already set in `tauri.conf.json`.

One-time setup is now complete. From here on, every release follows the "Publishing an update" flow
below.

---

## 2. Publishing an update (e.g. v1.1.0)

Repeat this for every release after 1.0.0. Assumes the one-time key setup above is already done and
the env vars are set in your build shell.

1. **Bump the version in all 3 places** (keep them in sync):
   - `package.json` → `"version": "1.1.0"`
   - `src-tauri/tauri.conf.json` → `"version": "1.1.0"`
   - `src-tauri/Cargo.toml` → `version = "1.1.0"`

2. **Build with signing env vars set** (see step 1 above for `TAURI_SIGNING_PRIVATE_KEY` /
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`):
   ```bash
   npm run tauri build
   ```
   This produces, among other bundle outputs:
   - `src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe` — the installer
   - `src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe.sig` — its signature

3. **Create a GitHub release** tagged `v1.1.0` on `prabindersinghh/Kaestral-pro` (via the GitHub web
   UI, or `gh release create v1.1.0 --title "Kaestral 1.1.0" --notes "..."`).

4. **Upload the installer** (`Kaestral_1.1.0_x64-setup.exe`) as a release asset.

5. **Generate `latest.json`** with the helper script:
   ```bash
   node scripts/make-latest-json.mjs 1.1.0 src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe.sig
   ```
   This reads the `.sig` file's contents, fills in `version` / `url` / `pub_date`, and writes
   `latest.json` in the project root (shape documented in `latest.json.template`).

6. **Upload `latest.json`** as a release asset on that same `v1.1.0` release.

7. Once uploaded, GitHub's "latest release" alias makes it reachable at:
   ```
   https://github.com/prabindersinghh/Kaestral-pro/releases/latest/download/latest.json
   ```
   — exactly the endpoint configured in `tauri.conf.json`'s `plugins.updater.endpoints`. (This only
   works if `v1.1.0` is marked as the latest release, not a pre-release/draft.)

8. **Done.** Existing users' apps call `check()` (via the "Check for updates" button in Settings →
   About, wired to `@tauri-apps/plugin-updater`) or you can later wire an automatic startup check; the
   updater fetches `latest.json`, compares versions, verifies the `.sig` against the pubkey baked into
   the app, downloads the new installer, and installs it — then the app relaunches via
   `@tauri-apps/plugin-process`'s `relaunch()`.

### Quick reference

```bash
# 1. bump versions in package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml

# 2. build (signing env vars already exported in this shell)
npm run tauri build

# 3-4. create release + upload installer
gh release create v1.1.0 --title "Kaestral 1.1.0" --notes "Release notes here" \
  "src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe"

# 5. generate latest.json
node scripts/make-latest-json.mjs 1.1.0 src-tauri/target/release/bundle/nsis/Kaestral_1.1.0_x64-setup.exe.sig

# 6. upload latest.json to the same release
gh release upload v1.1.0 latest.json
```

---

## Troubleshooting

- **"Check for updates" says nothing / errors in the desktop app**: confirm the release is marked
  "latest" (not a draft/pre-release) and that both the installer and `latest.json` were uploaded to it.
- **Update found but install fails signature verification**: the `pubkey` in `tauri.conf.json` doesn't
  match the private key used to sign that build — re-check you're using the same
  `~/.tauri/kaestral-updater.key` for every release.
- **Never commit `~/.tauri/kaestral-updater.key`** or paste its contents anywhere outside your local
  signing environment / CI secrets store.
