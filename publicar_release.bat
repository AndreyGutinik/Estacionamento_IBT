@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"

set "VERSION=%~1"
if "%VERSION%"=="" (
  set /p VERSION=Digite a versao sem o v ^(ex: 6.5.0^): 
)

set "MODE=%~2"
if /I "%MODE%"=="publish" goto run_publish
if /I "%MODE%"=="local" goto run_local

echo.
echo [1] Gerar instalador local
echo [2] Gerar e publicar no GitHub Releases
set /p MODE=Escolha 1 ou 2: 

if "%MODE%"=="2" goto run_publish

:run_local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" -Version "%VERSION%"
set "EXITCODE=%ERRORLEVEL%"
goto finish

:run_publish
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" -Version "%VERSION%" -Publish
set "EXITCODE=%ERRORLEVEL%"

:finish
if not "%EXITCODE%"=="0" (
  echo.
  echo O processo terminou com erro.
)
pause
exit /b %EXITCODE%
