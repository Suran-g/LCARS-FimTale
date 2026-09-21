@echo off
REM ===========================================================================
REM LCARS-FimTale pre-commit guard (Windows launcher)
REM ===========================================================================
REM Git for Windows prefers a hook named `pre-commit.bat` over the extensionless
REM `pre-commit`, and it can run this without needing its bundled POSIX shell.
REM The actual check lives in check-secrets.js so both platforms behave the same.
REM ===========================================================================

setlocal
set "HOOKDIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo NOTE: Node.js was not found, so the credential guard did not run.
  echo       Install Node.js, or make sure it is on PATH, to enable it.
  echo       Proceeding without the guard.
  echo.
  exit /b 0
)

node "%HOOKDIR%check-secrets.js"
exit /b %errorlevel%
