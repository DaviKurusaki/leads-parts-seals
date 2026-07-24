@echo off
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env
  echo O arquivo .env foi criado. Preencha as configuracoes e execute novamente.
  pause
  exit /b 1
)
npm start
pause
