@echo off
title Piloto automatico - catalogo
REM Actualiza el catalogo cada 15-20 minutos y lo publica en GitHub.
REM Cerrar esta ventana (o usar detener_piloto.bat) para detenerlo.
cd /d "%~dp0.."
python sincronizador\piloto.py --publicar
pause
