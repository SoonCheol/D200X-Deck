!macro customInstall
  ; Copy only on a Fusion installation that already created its API/AddIns folder.
  ; Never overwrite a user's existing FusionStreamDeck installation.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\bundled\install-fusion-addin.ps1"'
  ; Separate launcher, one installed application and one shared user-data directory.
  CreateShortCut "$SMPROGRAMS\Fusion Command Manager.lnk" "$INSTDIR\DeckForge.exe" "--fusion-manager" "$INSTDIR\resources\bundled\fusion-manager-icon.ico" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Fusion Command Manager.lnk"
  ; Keep user data by default. Only explicit YES removes DeckForge-owned roaming data.
  ; Do not delete historical product folders or any other application data.
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "DeckForge 사용자 데이터(프로필, 플러그인, 아이콘팩 및 설정)도 모두 삭제하시겠습니까?$\r$\n$\r$\n아니요를 선택하면 데이터는 보존됩니다." IDNO keepDeckForgeData
  RMDir /r "$APPDATA\DeckForge"
keepDeckForgeData:
!macroend
