// Tauri 2 entry point. In a PACKAGED build it runs everything from bundled resources (a bundled
// Node runtime + the esbuild'd server/renderCli + bundled FFmpeg + native canvas) so the user needs
// no Node/npm/tsx/FFmpeg. In `tauri dev` it falls back to `node --import tsx <source>`.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn no_window(cmd: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd;
}

/// Present only in a packaged build (bundled resources exist). Holds the paths the child needs.
struct Packaged {
    node: PathBuf,
    res: PathBuf,
    data: PathBuf,
}

fn packaged(app: &AppHandle) -> Option<Packaged> {
    let res = app.path().resolve("resources", BaseDirectory::Resource).ok()?;
    if !res.join("dist-server").join("server.cjs").exists() {
        return None; // dev
    }
    let data = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&data);
    Some(Packaged { node: res.join("node.exe"), res, data })
}

fn apply_env(cmd: &mut Command, p: &Packaged) {
    cmd.current_dir(&p.data)
        .env("MAESTRO_FFMPEG", p.res.join("ffmpeg.exe"))
        .env("MAESTRO_FFPROBE", p.res.join("ffprobe.exe"))
        .env("MAESTRO_PUBLIC_DIR", p.res.join("public"))
        .env("MAESTRO_REMOTION_DIR", p.res.join("remotion"))
        .env("MAESTRO_DATA_DIR", &p.data)
        .env("NODE_PATH", p.res.join("node_modules"));
}

/// Render the project to a video file (Export button). Packaged: bundled node + renderCli.cjs.
#[tauri::command]
fn export_video(
    app: AppHandle,
    project_json: String,
    out_path: String,
    codec: String,
    resolution: String,
) -> Result<String, String> {
    let mut cmd;
    if let Some(p) = packaged(&app) {
        cmd = Command::new(&p.node);
        cmd.arg(p.res.join("dist-server").join("renderCli.cjs"))
            .arg(&out_path)
            .arg(&codec)
            .arg(&resolution);
        apply_env(&mut cmd, &p);
    } else {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        let project_root = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd);
        cmd = Command::new("node");
        cmd.args(["--import", "tsx", "src/render/renderCli.ts", &out_path, &codec, &resolution])
            .current_dir(&project_root);
    }
    no_window(&mut cmd);
    let mut child = cmd
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

/// One-click Option B: a terminal window that connects Claude Code to Maestro and launches it.
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

/// Start the project/MCP server as a child. Packaged: bundled node + server.cjs + resource env.
fn spawn_project_server(app: &AppHandle) {
    let mut cmd;
    if let Some(p) = packaged(app) {
        cmd = Command::new(&p.node);
        cmd.arg(p.res.join("dist-server").join("server.cjs"));
        apply_env(&mut cmd, &p);
    } else {
        let cwd = match std::env::current_dir() {
            Ok(d) => d,
            Err(_) => return,
        };
        let project_root = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd);
        cmd = Command::new("node");
        cmd.args(["--import", "tsx", "src/mcp/main.ts"]).current_dir(&project_root);
    }
    no_window(&mut cmd);
    let _ = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            spawn_project_server(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_video, launch_claude_code])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
