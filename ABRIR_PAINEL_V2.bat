@echo off
title WS PAINEL DE MONITORAMENTO V2
chcp 65001 >nul

echo.
echo  =========================================================
echo   WS PAINEL DE MONITORAMENTO V2 - INICIANDO SERVIDOR
echo  =========================================================
echo.
echo  [1/3] Encerrando servidor anterior (se existir)...
FOR /F "tokens=5" %%P IN ('netstat -aon ^| find ":8000" ^| find "LISTENING"') DO (
    taskkill /F /PID %%P >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  [2/3] Iniciando servidor HTTP local na porta 8000...
start "" /B python -m http.server 8000
timeout /t 2 /nobreak >nul

echo  [3/3] Abrindo painel no navegador...
echo.
echo  Acesse manualmente: http://localhost:8000
echo.
start "" "http://localhost:8000"

echo  Painel ativo. NAO feche esta janela!
echo  (Fechar esta janela encerrara o servidor e desconectara o painel)
echo.
pause
