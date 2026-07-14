// CLI: run the Kaestral MCP server. Optionally load a .palmier project directory.
//   npm run mcp -- "C:/path/to/My Project.palmier"          (stdio transport — default)
//   npm run mcp -- --http "C:/path/to/My Project.palmier"   (HTTP transport)
//
// Stdio (default): claude mcp add kaestral -- npx kaestral
// HTTP (--http):   claude mcp add --transport http kaestral http://127.0.0.1:19789/mcp
//
// stdout is the JSON-RPC channel in stdio mode — ALL human-readable logging goes to stderr.

import { McpServer, MCP_PORT } from "./server";
import { runStdio } from "./stdio";
import { McpExecutor } from "./executor";
import { MediaLibrary, type MediaAssetLite } from "./mediaLibrary";
import { nodePackageFS } from "../project/nodeFs";
import { readProjectPackage } from "../project/package";
import type { Timeline } from "../model/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const httpMode = args.includes("--http");
  const dir = args.find((a) => a !== "--http");
  const fs = nodePackageFS();
  let timeline: Timeline | undefined;
  const media = new MediaLibrary();

  if (dir) {
    const contents = await readProjectPackage(fs, dir);
    timeline = contents.timeline;
    if (contents.manifest) {
      media.folders = contents.manifest.folders;
      media.assets = contents.manifest.entries.map(
        (e): MediaAssetLite => ({
          id: e.id, name: e.name, type: e.type, duration: e.duration, source: e.source,
          folderId: e.folderId, sourceWidth: e.sourceWidth, sourceHeight: e.sourceHeight,
          sourceFPS: e.sourceFPS, hasAudio: e.hasAudio, generationStatus: e.generationStatus,
        }),
      );
    }
  }

  const executor = new McpExecutor({ timeline, media, fs, projectDir: dir });

  if (httpMode) {
    const server = new McpServer(executor);
    await server.start();
    // Log to stderr so stdout stays clean for any pipe consumers.
    console.error(
      `Kaestral MCP listening on http://127.0.0.1:${MCP_PORT}/mcp` +
        (dir ? ` (project: ${dir})` : " (empty project)"),
    );
    return;
  }

  // Default: stdio transport. stdout is reserved for JSON-RPC — this line goes to stderr only.
  console.error(`Kaestral MCP running on stdio` + (dir ? ` (project: ${dir})` : " (empty project)"));
  await runStdio(executor);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
