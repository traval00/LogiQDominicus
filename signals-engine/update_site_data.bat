@echo off
REM --- paths ---
set ENGINE=C:\Users\trave\Documents\LogiQDominicus\signals-engine
set SITE=C:\Users\trave\Documents\LogiQDominicus\logiqsignals-site

REM --- run your engine (adjust if your command is different) ---
call "%ENGINE%\.venv\Scripts\activate.bat"
python "%ENGINE%\generate_signals.py"
python "%ENGINE%\run_swing.py"

REM --- copy JSONs into the site (these names are what the UI loads) ---
copy /Y "%ENGINE%\output\signals.json"       "%SITE%\public\data\signals.json"
copy /Y "%ENGINE%\output\signals_swing.json" "%SITE%\public\data\signals_swing.json"

echo Done. Press any key to exit.
pause >nul
