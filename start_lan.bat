@echo off
echo Запуск для школьной сети. Откройте адрес компьютера (ipconfig) с портом 8000, например http://192.168.1.5:8000
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Создаю окружение...
  py -m venv .venv
)
call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --reload
pause
