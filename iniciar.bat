@echo off
setlocal
cd /d "%~dp0"
title Parts Seals - Inicializador

set "PRECISA_INSTALAR=0"
where node.exe >nul 2>&1
if errorlevel 1 set "PRECISA_INSTALAR=1"
where npm.cmd >nul 2>&1
if errorlevel 1 set "PRECISA_INSTALAR=1"
if not exist "%~dp0node_modules\express\package.json" set "PRECISA_INSTALAR=1"
if not exist "%~dp0.env" set "PRECISA_INSTALAR=1"

if "%PRECISA_INSTALAR%"=="1" (
  echo Primeira execucao detectada. Preparando o computador...
  call "%~dp0instalar.bat" --automatico
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar os requisitos do projeto.
    pause
    exit /b 1
  )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_project.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o projeto.
  echo Consulte as mensagens acima ou a pasta data\logs.
  pause
  exit /b 1
)

endlocal
