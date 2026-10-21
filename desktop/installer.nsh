!macro customUnInstall
  ${ifNot} ${isUpdated}
    IfFileExists "$INSTDIR\Disconnect-Codex.cmd" 0 usage_cleanup_done
    nsExec::ExecToLog '"$SYSDIR\cmd.exe" /d /s /c ""$INSTDIR\Disconnect-Codex.cmd""'
    Pop $0
    usage_cleanup_done:
  ${endIf}
!macroend
