@echo off
chcp 65001 > nul
powershell -ExecutionPolicy Bypass -File "%~dp0csv_to_json.ps1"
pause
