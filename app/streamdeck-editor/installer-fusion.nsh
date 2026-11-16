!macro customInstall
  ; Copy only on a Fusion installation that already created its API/AddIns folder.
  ; Never overwrite a user's existing FusionStreamDeck installation.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\bundled\install-fusion-addin.ps1"'
  ; Separate launcher, one installed application and one shared user-data directory.
  CreateShortCut "$SMPROGRAMS\Fusion Command Manager.lnk" "$INSTDIR\DeckForge.exe" "--fusion-manager"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Fusion Command Manager.lnk"
!macroend
