@echo off
chcp 65001 >nul
echo ========================================
echo   Sprite Sheet Splitter
echo ========================================
echo.

:: Idle (3x2, 6 frames)
echo [Idle] Splitting...
py "%~dp0split_sprite.py" "%~dp0Player\Idle\Idle_total.png" 3 2

echo.
echo All done!
pause
