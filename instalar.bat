@echo off
setlocal
cd /d "%~dp0"
title Parts Seals - Instalacao

set "MODO_AUTOMATICO=0"
if /I "%~1"=="--automatico" set "MODO_AUTOMATICO=1"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Instalando a versao LTS...
  where winget.exe >nul 2>&1
  if errorlevel 1 (
    echo.
    echo O instalador automatico do Windows nao foi encontrado.
    echo Instale o Node.js LTS em https://nodejs.org/ e execute novamente.
    goto :erro
  )

  winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements --disable-interactivity
  if errorlevel 1 goto :erro

  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js foi instalado, mas o Windows ainda nao atualizou o PATH.
  echo Feche esta janela e execute iniciar.bat novamente.
  goto :erro
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo O npm nao foi encontrado junto com o Node.js.
  goto :erro
)

echo Instalando dependencias do projeto...
call npm.cmd install
if errorlevel 1 goto :erro

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Arquivo .env criado.
)

echo.
echo Instalacao concluida com sucesso.
if "%MODO_AUTOMATICO%"=="0" pause
endlocal
exit /b 0

:erro
echo.
echo A instalacao nao foi concluida.
if "%MODO_AUTOMATICO%"=="0" pause
endlocal
exit /b 1
