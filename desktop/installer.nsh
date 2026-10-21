!macro RunCodexSetup mode
  System::Call 'kernel32::GetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t .r2, i ${NSIS_MAX_STRLEN}) i .r3'
  System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i .r4'
  nsExec::ExecToStack /TIMEOUT=70000 '"$INSTDIR\Codex Usage Monitor.exe" "$INSTDIR\resources\app.asar\desktop\codex-integration.js" ${mode}'
  Pop $0
  Pop $1
  ${If} $3 == 0
    System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i .r4'
  ${Else}
    System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t r2) i .r4'
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro RunCodexSetup ""
  ${If} $0 != 0
    IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "Codex connection failed: $1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  Delete "$INSTDIR\Connect-Codex.cmd"
  Delete "$INSTDIR\Disconnect-Codex.cmd"
  ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\Codex Usage Monitor.exe" "open" "--managed --show"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro RunCodexSetup "--remove"
  ${endIf}
!macroend
