!macro customInstall
  ; Copy only on a Fusion installation that already created its API/AddIns folder.
  ; Never overwrite a user's existing FusionStreamDeck installation.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\bundled\install-fusion-addin.ps1"'
!macroend
