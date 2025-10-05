@echo off
cd /d C:\Users\trave\Documents\LogiQDominicus\signals-engine
.\.venv\Scripts\activate

echo === Options ===
python options_picker.py

echo === Crypto Movers ===
python crypto_movers.py

echo === Swing ===
python run_swing.py

echo === Intraday ===
python generate_signals.py

echo === Copy to site/public ===
copy ".\output\signals.json" "..\logiqsignals-site\public\signals.json" /Y
copy ".\output\signals_swing.json" "..\logiqsignals-site\public\signals_swing.json" /Y
copy ".\output\options.json" "..\logiqsignals-site\public\options.json" /Y
copy ".\output\crypto_movers.json" "..\logiqsignals-site\public\crypto_movers.json" /Y

echo Done.
pause
