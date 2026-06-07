@echo off
title Neo Manga Reader & Scraper Hub
cls
:menu
echo ====================================================
echo            🌌 NEO MANGA READER & SCRAPER HUB 🌌
echo ====================================================
echo  1. Launch Web Application (Dev Mode)
echo  2. Launch Web Application (Production Mode)
echo  3. Run Command-Line Scraper (Interactive)
echo  4. Clear Stale Lock File (Database Unlocking)
echo  5. Clean Install Dependencies
echo  6. Exit
echo ====================================================
set /p choice="Enter option (1-6): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto scraper
if "%choice%"=="4" goto lock
if "%choice%"=="5" goto install
if "%choice%"=="6" exit
echo.
echo [Warning] Invalid selection. Please enter a number from 1 to 6.
echo.
pause
goto menu

:dev
cls
echo ====================================================
echo          LAUNCHING DEVELOPMENT ENVIRONMENT
echo ====================================================
if not exist node_modules (
    echo [System] node_modules not found. Installing dependencies first...
    call npm install
)
echo [System] Starting Next.js Dev Server...
echo [System] Opening browser to http://localhost:3000...
echo.
start http://localhost:3000
call npm run dev
pause
goto menu

:prod
cls
echo ====================================================
echo          BUILDING & LAUNCHING PRODUCTION
echo ====================================================
if not exist node_modules (
    echo [System] node_modules not found. Installing dependencies first...
    call npm install
)
echo [System] Building Next.js optimized production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [Error] Production build failed!
    pause
    goto menu
)
echo [System] Starting production server...
echo [System] Opening browser to http://localhost:3000...
echo.
start http://localhost:3000
call npm run start
pause
goto menu

:scraper
cls
echo ====================================================
echo              CLI SCRAPER RUNNER
echo ====================================================
set /p url="Enter Series URL (e.g., https://olympustaff.com/series/TCF): "
set /p limit="Enter chapter limit (optional, press Enter to crawl all): "
echo.
echo [System] Spawning scraper process...
if "%limit%"=="" (
    node scripts/scrape-series.js "%url%"
) else (
    node scripts/scrape-series.js "%url%" %limit%
)
echo.
pause
goto menu

:lock
cls
echo ====================================================
echo             CLEARING DATABASE LOCK
echo ====================================================
if exist data\mangas.json.lock (
    echo [System] Clearing lock file...
    del /f /q data\mangas.json.lock
    echo [System] Database lock cleared successfully!
) else (
    echo [System] No lock file found. Database is already unlocked.
)
echo.
pause
goto menu

:install
cls
echo ====================================================
echo             CLEAN INSTALLING DEPENDENCIES
echo ====================================================
echo [Warning] This will wipe existing node_modules and reinstall everything.
set /p confirm="Are you sure you want to proceed? (y/n): "
if /i "%confirm%" neq "y" goto menu
echo.
if exist node_modules (
    echo [System] Deleting existing node_modules...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    echo [System] Deleting package-lock.json...
    del /f /q package-lock.json
)
echo [System] Running clean npm install...
call npm install
echo [System] Dependencies successfully reinstalled!
echo.
pause
goto menu
