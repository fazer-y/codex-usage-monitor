Unicode true
!include "LogicLib.nsh"
Name "Codex Usage Monitor"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Codex Usage Monitor"
InstallDirRegKey HKCU "Software\Codex Usage Monitor" "InstallLocation"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Codex Usage Monitor"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "Codex Usage Monitor Setup"
VIAddVersionKey "LegalCopyright" "MIT License"
Icon "assets\icon.ico"
UninstallIcon "assets\icon.ico"

Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=runtime-check.exe "${PACKAGE}\Codex Usage Monitor.exe"
  nsExec::ExecToStack /TIMEOUT=30000 '"$PLUGINSDIR\runtime-check.exe" --check-runtime'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  nsExec::ExecToStack /TIMEOUT=30000 '"$PLUGINSDIR\runtime-check.exe" --stop-installed "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Close Codex Usage Monitor and run setup again. $1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\resources\app.asar" 0 LegacyDone
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\app-update.yml"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\resources\app.asar.unpacked\desktop\native\bin\window-observer.exe"
  RMDir "$INSTDIR\resources\app.asar.unpacked\desktop\native\bin"
  RMDir "$INSTDIR\resources\app.asar.unpacked\desktop\native"
  RMDir "$INSTDIR\resources\app.asar.unpacked\desktop"
  RMDir "$INSTDIR\resources\app.asar.unpacked"
  RMDir "$INSTDIR\resources"
  Delete "$INSTDIR\locales\*.pak"
  RMDir "$INSTDIR\locales"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\Uninstall Codex Usage Monitor.exe"
  LegacyDone:
  SetOutPath "$INSTDIR"
  File /r "${PACKAGE}\*"
  nsExec::ExecToStack /TIMEOUT=70000 '"$INSTDIR\Codex Usage Monitor.exe" --setup'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Codex connection failed: $1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Codex Usage Monitor" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "DisplayName" "Codex Usage Monitor"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "Publisher" "fazer-y"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\Codex Usage Monitor"
  CreateShortcut "$SMPROGRAMS\Codex Usage Monitor\Codex Usage Monitor.lnk" "$INSTDIR\Codex Usage Monitor.exe" "--show"
  CreateShortcut "$DESKTOP\Codex Usage Monitor.lnk" "$INSTDIR\Codex Usage Monitor.exe" "--show"
  Exec '"$INSTDIR\Codex Usage Monitor.exe" --managed --show'
SectionEnd

Section "Uninstall"
  nsExec::ExecToStack /TIMEOUT=70000 '"$INSTDIR\Codex Usage Monitor.exe" --remove'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Codex disconnection failed: $1"
    Abort
  ${EndIf}
  InitPluginsDir
  CopyFiles /SILENT "$INSTDIR\Codex Usage Monitor.exe" "$PLUGINSDIR\stop.exe"
  nsExec::ExecToStack /TIMEOUT=30000 '"$PLUGINSDIR\stop.exe" --stop-installed "$INSTDIR"'
  Pop $0
  Pop $1
  Delete "$INSTDIR\Codex Usage Monitor.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\README.zh-CN.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\plugin.json"
  Delete "$INSTDIR\mcp.json"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\.codex-plugin"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Codex Usage Monitor.lnk"
  Delete "$SMPROGRAMS\Codex Usage Monitor\Codex Usage Monitor.lnk"
  RMDir "$SMPROGRAMS\Codex Usage Monitor"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexUsageMonitor"
  DeleteRegKey HKCU "Software\Codex Usage Monitor"
SectionEnd
