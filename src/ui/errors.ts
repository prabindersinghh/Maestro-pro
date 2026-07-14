// Humanize raw errors before they reach the UI. Users should never see a stack trace, a dev-speak
// string, or an HTTP status code — just a clean, warm sentence. The real error always still goes to
// console.error so debugging isn't harmed.

/** Turn any thrown value / Error into a short human sentence, tailored by `context`. */
export function humanizeError(e: unknown, context?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-console
  console.error(context ? `[kaestral] ${context}:` : "[kaestral]", e);

  const msg = raw.toLowerCase();

  if (/failed to fetch|networkerror|network request failed|econnrefused|fetch failed/.test(msg)) {
    return "Couldn't reach the project engine — is it still running?";
  }
  if (/^state \d+$/.test(msg) || /^import \d+$/.test(msg) || /^upload \d+$/.test(msg) || /^gen-config \d+$/.test(msg) || /^gpu[- ](start|stop|config) \d+$/.test(msg) || /^\w+ \d{3}$/.test(msg)) {
    return "Couldn't reach the project engine — is it still running?";
  }
  if (/tauri|invoke|not.*function|undefined is not/.test(msg)) {
    return "That only works inside the Kaestral desktop app.";
  }
  if (/timed?.?out/.test(msg)) {
    return "That took too long and timed out. Please try again.";
  }
  if (/permission denied|eacces|access is denied/.test(msg)) {
    return "Kaestral doesn't have permission to do that. Check the file or folder isn't locked elsewhere.";
  }
  if (/no such file|enoent|not found/.test(msg)) {
    return "Couldn't find that file. It may have been moved or deleted.";
  }
  if (/out of memory|enomem/.test(msg)) {
    return "Ran out of memory for that operation. Try a shorter clip or lower resolution.";
  }
  if (/api key|unauthorized|401|invalid x-api-key/.test(msg)) {
    return "Your API key wasn't accepted. Check it in Settings → Connect AI.";
  }
  if (/429|rate.?limit|overloaded|529/.test(msg)) {
    return "The AI is busy right now. Please wait a moment and try again.";
  }
  if (/anthropic \d{3}|^\{.*"error".*\}$/.test(msg)) {
    return "The AI hit a snag processing that. Please try again.";
  }

  // Fallback: if the message looks reasonably human already (short, no code-ish tokens), keep it;
  // otherwise fall back to a clean generic sentence so no dev string / stack trace leaks through.
  const looksHuman = raw.length > 0 && raw.length < 140 && !/[{}<>]|\bat\s+\w+\s*\(|\.(ts|tsx|js|cjs):\d+/.test(raw);
  if (looksHuman && !/^[a-z]+ \d{3}$/.test(msg)) {
    return context ? `${context} — ${raw}` : raw;
  }
  return context ? `${context}. Something went wrong — please try again.` : "Something went wrong — please try again.";
}
