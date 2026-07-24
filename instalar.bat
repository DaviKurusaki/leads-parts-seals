@echo off
cd /d "%~dp0"
echo Instalando dependencias...
npm install
if not exist .env copy .env.example .env
echo.
echo Instalacao concluida.
echo Edite o arquivo .env antes de iniciar.
pause
