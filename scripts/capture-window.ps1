# Capture a specific window's pixels by process name via Win32 PrintWindow (PW_RENDERFULLCONTENT),
# which grabs the window even when it's occluded/background — the reliable way to shoot the app UI.
# Usage: powershell -File capture-window.ps1 -ProcName kaestral -Out C:\path\shot.png
param([string]$ProcName = "kaestral", [string]$Out = "$env:LOCALAPPDATA\Temp\win.png")

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;using System.Runtime.InteropServices;using System.Drawing;
public class Cap{
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
 public struct RECT{public int L,T,R,B;}
 public static bool Grab(IntPtr h, string path){
   RECT r; GetClientRect(h, out r);
   int w=r.R-r.L, hh=r.B-r.T; if(w<=0||hh<=0) return false;
   Bitmap bmp=new Bitmap(w,hh); Graphics g=Graphics.FromImage(bmp); IntPtr dc=g.GetHdc();
   bool ok=PrintWindow(h, dc, 0x2); // PW_RENDERFULLCONTENT (captures WebView2/Chromium content)
   g.ReleaseHdc(dc); g.Dispose();
   bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png); bmp.Dispose(); return ok;
 }
}
"@

$p = Get-Process $ProcName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "no-window"; exit 1 }
$ok = [Cap]::Grab($p.MainWindowHandle, $Out)
Write-Output "printwindow=$ok saved=$Out"
