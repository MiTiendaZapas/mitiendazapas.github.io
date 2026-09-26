@echo off
title Detener piloto automatico
cd /d "%~dp0"
if not exist estado\piloto.pid (
    echo El piloto no parece estar corriendo ^(no se encontro estado\piloto.pid^).
    pause
    exit /b
)
set /p PID=<estado\piloto.pid
taskkill /F /PID %PID% >nul 2>&1
del estado\piloto.pid >nul 2>&1
echo Piloto detenido.
pause
