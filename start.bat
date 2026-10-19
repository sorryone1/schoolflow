@echo off
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Создаю окружение...
  py -m venv .venv
)
call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
pause
