@echo off
setlocal
cd /d %~dp0
.\.venv\Scripts\activate

echo [1/2] Intraday/Crypto...
python generate_signals.py

echo [2/2] Swing...
python run_swing.py

echo Copying JSONs into site...
set SRC=%CD%\output
set DEST=C:\Users\trave\Documents\LogiQDominicus\logiqsignals-site\public\data

if not exist "%DEST%" mkdir "%DEST%"
copy /y "%SRC%\signals.json" "%DEST%\signals.json" >nul
copy /y "%SRC%\signals_swing.json" "%DEST%\signals_swing.json" >nul

echo Done.
endlocal
