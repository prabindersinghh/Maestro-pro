# Launch decisions (locked by user, 2026-07-14)

1. REPO NAME: user renames github.com/prabindersinghh/Maestro-pro -> **Kaestral-pro** on GitHub.
   All links (package.json repository/homepage, README, landing download button, updater endpoint,
   NOTICE) point to github.com/prabindersinghh/Kaestral-pro. Download permalink pattern:
   https://github.com/prabindersinghh/Kaestral-pro/releases/latest/download/Kaestral_1.0.0_x64-setup.exe
   Updater endpoint: https://github.com/prabindersinghh/Kaestral-pro/releases/latest/download/latest.json

2. NPM: publish root package as bare name **kaestral** (`npm publish --access public`).
   `npx kaestral` works verbatim. Availability to be confirmed at publish time; fallback @prabindersinghh/kaestral.

3. MCP TRANSPORT: ADD A REAL STDIO TRANSPORT so `claude mcp add kaestral -- npx kaestral` works
   as ONE command (stdio). Keep the existing HTTP server (127.0.0.1:19789) intact as the alternate
   path for the in-app "Connect AI" flow and http-transport users. bin/kaestral.mjs must support both:
   default `npx kaestral` -> stdio MCP on stdin/stdout; a flag (e.g. `--http`) -> the HTTP server.

VERSION: bump 0.0.1 -> 1.0.0 in package.json:3, src-tauri/tauri.conf.json:4, src-tauri/Cargo.toml:3.
Installer output: Kaestral_1.0.0_x64-setup.exe (NSIS default {productName}_{version}_{arch}-setup.exe).

--- landing (step 5) ---
DOWNLOAD BUTTON: point at the always-newest RELEASES PAGE:
  https://github.com/prabindersinghh/Kaestral-pro/releases/latest
  (never breaks on version bump; user clicks the .exe there.)
FORMSPREE: user will paste the endpoint. Until then WAITLIST_ENDPOINT stays a clearly-marked
  placeholder with mailto fallback. PENDING: user to provide https://formspree.io/f/xxxxx.
FORMSPREE (received): https://formspree.io/f/xrenbavp
