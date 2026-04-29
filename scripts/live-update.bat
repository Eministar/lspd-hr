@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

if not defined LSPD_APP_DIR set "LSPD_APP_DIR=C:\inetpub\vhosts\nerovlspd.de\httpdocs"
set "APP_DIR=%LSPD_APP_DIR%"
set "REMOTE=origin"
set "BRANCH=main"
set "LOG_DIR=%APP_DIR%\deploy-logs"
set "BACKUP_MESSAGE=Backup before GitHub update"
set "MERGE_MESSAGE=Merge GitHub updates into live production"

echo ==========================================
echo LSPD HR Live Update
echo ==========================================
echo.

if not exist "%APP_DIR%" (
  echo FEHLER: Projektordner wurde nicht gefunden:
  echo   %APP_DIR%
  echo.
  pause
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%I"
set "LOG_FILE=%LOG_DIR%\live-update-%STAMP%.log"

echo Logdatei:
echo   %LOG_FILE%
echo.

call :logline "=========================================="
call :logline "LSPD HR Live Update gestartet"
call :logline "App: %APP_DIR%"
call :logline "Remote: %REMOTE%/%BRANCH%"
call :logline "=========================================="

cd /d "%APP_DIR%"
if errorlevel 1 (
  set "FAIL_REASON=Konnte nicht in den Projektordner wechseln."
  goto failed
)

if not exist ".git" (
  set "FAIL_REASON=Der Projektordner ist kein Git-Repository."
  goto failed
)

call :section "1/10" "Umgebung prüfen"
call :run "Git Version" "git --version" || goto failed
call :run "Node Version" "node -v" || goto failed
call :run "NPM Version" "npm -v" || goto failed

call :section "2/10" "Aktueller Git Status"
call :run "Branch anzeigen" "git branch --show-current" || goto failed
call :run "Git Status anzeigen" "git status --short" || goto failed
call :run "Lokalen Commit anzeigen" "git log -1 --oneline" || goto failed

call :section "3/10" "Neue Updates von GitHub holen"
call :run "Fetch %REMOTE%/%BRANCH%" "git fetch %REMOTE% %BRANCH% --prune" || goto failed
call :run "Remote Commit anzeigen" "git log -1 --oneline %REMOTE%/%BRANCH%" || goto failed

call :section "4/10" "Fehlende GitHub-Commits prüfen"
set "REMOTE_COMMITS=%TEMP%\lspd_remote_commits_%RANDOM%%RANDOM%.txt"
git log --oneline HEAD..%REMOTE%/%BRANCH% > "%REMOTE_COMMITS%" 2>> "%LOG_FILE%"
if errorlevel 1 (
  set "FAIL_REASON=Konnte fehlende Remote-Commits nicht prüfen."
  goto failed
)

for %%A in ("%REMOTE_COMMITS%") do set "REMOTE_COMMITS_SIZE=%%~zA"
if "!REMOTE_COMMITS_SIZE!"=="0" (
  echo Keine neuen GitHub-Updates vorhanden.
  echo Live-Version enthält bereits alle Commits aus %REMOTE%/%BRANCH%.
  call :logline "Keine neuen GitHub-Updates vorhanden."
  del /q "%REMOTE_COMMITS%" >nul 2>&1
  echo.
  call :run "Finaler Git Status" "git status --short" || goto failed
  echo.
  echo ==========================================
  echo UPDATE NICHT NÖTIG
  echo ==========================================
  echo Logdatei: %LOG_FILE%
  echo.
  pause
  exit /b 0
)

echo Neue GitHub-Commits:
type "%REMOTE_COMMITS%"
type "%REMOTE_COMMITS%" >> "%LOG_FILE%"
del /q "%REMOTE_COMMITS%" >nul 2>&1

call :section "5/10" "Lokale Änderungen sichern"
set "STATUS_FILE=%TEMP%\lspd_git_status_%RANDOM%%RANDOM%.txt"
git status --porcelain > "%STATUS_FILE%" 2>> "%LOG_FILE%"
if errorlevel 1 (
  set "FAIL_REASON=Konnte lokalen Git-Status nicht prüfen."
  goto failed
)

for %%A in ("%STATUS_FILE%") do set "STATUS_SIZE=%%~zA"
if "!STATUS_SIZE!"=="0" (
  echo Keine lokalen Änderungen vorhanden.
  call :logline "Keine lokalen Änderungen vorhanden."
) else (
  echo Lokale Änderungen gefunden:
  type "%STATUS_FILE%"
  type "%STATUS_FILE%" >> "%LOG_FILE%"
  echo.
  call :run "Lokale Änderungen als Sicherheits-Commit vormerken" "git add -A" || goto failed
  set "BACKUP_COMMIT_MSG=%TEMP%\lspd_backup_commit_msg_%RANDOM%%RANDOM%.txt"
  > "!BACKUP_COMMIT_MSG!" echo %BACKUP_MESSAGE%
  call :run "Sicherheits-Commit erstellen" "git commit -F !BACKUP_COMMIT_MSG!" || goto failed
  del /q "!BACKUP_COMMIT_MSG!" >nul 2>&1
)
del /q "%STATUS_FILE%" >nul 2>&1

call :section "6/10" "GitHub Updates mergen"
git merge-base --is-ancestor HEAD %REMOTE%/%BRANCH% >nul 2>> "%LOG_FILE%"
if "!errorlevel!"=="0" (
  call :run "Fast-forward Merge ausführen" "git merge --ff-only %REMOTE%/%BRANCH%" || goto merge_failed
) else (
  call :run "Merge-Commit ausführen" "git merge --no-ff --no-edit %REMOTE%/%BRANCH%" || goto merge_failed
)

call :section "7/10" "Pakete installieren"
call :run "npm install" "npm install" || goto failed

call :section "8/10" "Next.js Build-Cache löschen"
if exist ".next" (
  call :run ".next löschen" "rmdir /s /q .next" || goto failed
) else (
  echo .next existiert nicht. Cache-Löschung übersprungen.
  call :logline ".next existiert nicht. Cache-Löschung übersprungen."
)

call :section "9/10" "Projekt bauen"
call :run "npm run build" "npm run build" || goto build_failed

call :section "10/10" "Abschluss prüfen"
call :run "Aktuellen Commit anzeigen" "git log -1 --oneline" || goto failed
call :run "Finalen Git Status anzeigen" "git status --short" || goto failed

echo.
echo ==========================================
echo UPDATE ERFOLGREICH ABGESCHLOSSEN
echo ==========================================
echo Logdatei:
echo   %LOG_FILE%
echo.
pause
exit /b 0

:merge_failed
echo.
echo ==========================================
echo MERGE-KONFLIKT ODER MERGE-FEHLER
echo ==========================================
echo.
echo Bitte Konflikte manuell lösen. Danach:
echo.
echo   git status
echo   git add -A
echo   git commit -m "%MERGE_MESSAGE%"
echo   npm install
echo   npm run build
echo.
echo Logdatei:
echo   %LOG_FILE%
echo.
pause
exit /b 1

:build_failed
echo.
echo ==========================================
echo BUILD FEHLGESCHLAGEN
echo ==========================================
echo.
echo Der Code wurde aktualisiert, aber der Build hat Fehler.
echo Prüfe die Ausgabe oben und die Logdatei:
echo   %LOG_FILE%
echo.
pause
exit /b 1

:failed
echo.
echo ==========================================
echo UPDATE FEHLGESCHLAGEN
echo ==========================================
echo.
if defined FAIL_REASON (
  echo Grund:
  echo   !FAIL_REASON!
  echo.
)
echo Prüfe die Ausgabe oben und die Logdatei:
echo   %LOG_FILE%
echo.
pause
exit /b 1

:section
echo.
echo ==========================================
echo [%~1] %~2
echo ==========================================
call :logline ""
call :logline "=========================================="
call :logline "[%~1] %~2"
call :logline "=========================================="
exit /b 0

:run
set "RUN_TITLE=%~1"
set "RUN_CMD=%~2"
set "RUN_LOG=%TEMP%\lspd_step_%RANDOM%%RANDOM%.log"

echo.
echo -- %RUN_TITLE%
echo $ %RUN_CMD%
call :logline ""
call :logline "-- %RUN_TITLE%"
call :logline "$ %RUN_CMD%"

cmd /d /s /c "%RUN_CMD%" > "%RUN_LOG%" 2>&1
set "RUN_CODE=!errorlevel!"

if exist "%RUN_LOG%" (
  type "%RUN_LOG%"
  type "%RUN_LOG%" >> "%LOG_FILE%"
  del /q "%RUN_LOG%" >nul 2>&1
)

if not "!RUN_CODE!"=="0" (
  echo.
  echo [FEHLER] %RUN_TITLE% ist fehlgeschlagen. Exitcode: !RUN_CODE!
  call :logline "[FEHLER] %RUN_TITLE% ist fehlgeschlagen. Exitcode: !RUN_CODE!"
  exit /b !RUN_CODE!
)

echo [OK] %RUN_TITLE%
call :logline "[OK] %RUN_TITLE%"
exit /b 0

:logline
if "%~1"=="" (
  >> "%LOG_FILE%" echo.
) else (
  >> "%LOG_FILE%" echo %~1
)
exit /b 0
