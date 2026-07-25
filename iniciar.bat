@echo off
setlocal
cd /d "%~dp0"
title Parts Seals - Inicializador

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_project.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar o projeto.
  echo Consulte as mensagens acima ou a pasta data\logs.
  pause
  exit /b 1
)

endlocal
