@echo off
echo ============================================
echo   Push to GitHub (Direct)
echo ============================================
echo.

echo Type your GitHub Token:
set /p TOKEN=Token: 

if "%TOKEN%"=="" (
    echo No token. Exiting.
    pause
    exit /b
)

echo.
echo Pushing...
echo.

cd /d "%~dp0"
git config --global http.sslVerify false
git remote set-url origin https://hemeixian:%TOKEN%@github.com/hemeixian/career-ai-platform.git
git push -u origin main
set RESULT=%ERRORLEVEL%
git remote set-url origin https://github.com/hemeixian/career-ai-platform.git

echo.
if %RESULT% EQU 0 (
    echo ========================================
    echo   SUCCESS! Pushed to GitHub!
    echo   https://github.com/hemeixian/career-ai-platform
    echo ========================================
) else if %RESULT% EQU 128 (
    echo FAILED (128): Authentication error.
    echo Your token might not have 'repo' scope.
    echo Create new token: https://github.com/settings/tokens/new
) else (
    echo FAILED: %RESULT%
)

echo.
pause
