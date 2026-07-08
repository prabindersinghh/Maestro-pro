// Tauri 2 entry point. Exposes `export_video`, which renders the current project to a video file
// by piping its JSON to the Node render CLI (@napi-rs/canvas → FFmpeg). Node is spawned with the
// tsx loader so no build step is needed in dev.

use std::io::Write;
use std::process::{Command, Stdio};

/// Render the project to a video file. `project_json` = {timeline, media}; returns the CLI's
/// result JSON ({outputPath, frames, width, height, codec}) or an error string.
#[tauri::command]
fn export_video(project_json: String, out_path: String, codec: String, resolution: String) -> Result<String, String> {
    // In `tauri dev` the working dir is src-tauri/; the frontend project root (with node_modules
    // and src/render/renderCli.ts) is its parent.
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let project_root = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd);

    let mut child = Command::new("node")
        .args(["--import", "tsx", "src/render/renderCli.ts", &out_path, &codec, &resolution])
        .current_dir(&project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to launch renderer (node): {e}"))?;

    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(project_json.as_bytes())
        .map_err(|e| e.to_string())?;

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// One-click Option B: open a new terminal window that connects Claude Code to Maestro's MCP server
/// and launches it. `& claude` runs even if the server was already added.
#[tauri::command]
fn launch_claude_code() -> Result<String, String> {
    let connect = "claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp & claude";
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/c", "start", "Maestro — Claude Code", "cmd", "/k", connect])
            .spawn()
            .map_err(|e| format!("failed to open terminal: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = connect;
        return Err("Launch is only wired for Windows in this build.".into());
    }
    Ok("launched".into())
}

/// Spawn the project/MCP server (shared state + media + Claude's MCP endpoint) as a child.
/// If port 19789 is already taken (server running externally), the child exits harmlessly.
fn spawn_project_server() {
    let cwd = match std::env::current_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let project_root = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd);
    let _ = Command::new("node")
        .args(["--import", "tsx", "src/mcp/main.ts"])
        .current_dir(&project_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            spawn_project_server();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_video, launch_claude_code])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
