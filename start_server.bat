@echo off
title WS PAINEL DE MONITORAMENTO V2
chcp 65001 >nul

:: ================================================
:: WS PAINEL DE MONITORAMENTO V2 - INICIANDO SERVIDOR
:: ================================================

:: 1) Encerrar servidor anterior (porta 8000) se existir
for /F "tokens=5" %%P in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 2) Iniciar servidor HTTP local na porta 8000
start "" /B python -m http.server 8000

:: Pequeno delay para garantir que o servidor esteja pronto
timeout /t 2 /nobreak >nul

:: 3) Abrir o navegador apontando para o painel
start "" "http://localhost:8000"

:: Mensagens de informação
echo.
echo   WS PAINEL DE MONITORAMENTO V2 - SERVIDOR ATIVO
echo   NAO feche esta janela!  (Fechar encerrara o servidor)

:: Manter a janela aberta até que o usu\u00E1rio pressione uma tecla
pause
