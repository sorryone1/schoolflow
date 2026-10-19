"""Create a consistent backup of the SQLite database and uploaded photos."""
from pathlib import Path
from datetime import datetime
import os
import sqlite3
import shutil

BASE = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass
DATA_DIR = Path(os.environ.get("SCHOOL_PLUS_DATA_DIR", str(BASE))).expanduser().resolve()
SOURCE = DATA_DIR / "school_plus.db"
if not SOURCE.exists():
    raise SystemExit(f"Database not found: {SOURCE}. Run the app first.")
ROOT = DATA_DIR / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
ROOT.mkdir(parents=True, exist_ok=False)
with sqlite3.connect(SOURCE) as src, sqlite3.connect(ROOT / "school_plus.db") as dst:
    src.backup(dst)
if (DATA_DIR / "uploads").exists():
    shutil.copytree(DATA_DIR / "uploads", ROOT / "uploads", dirs_exist_ok=True)
print("Backup created at:", ROOT)
print("WARNING: this copy is on the SAME volume. Move backups to a separate protected storage to survive volume loss.")
retention = os.getenv('SCHOOL_PLUS_BACKUP_KEEP')
if retention:
    keep = max(1, int(retention))
    directories = sorted((DATA_DIR / 'backups').iterdir(), key=lambda x: x.name, reverse=True)
    for old in directories[keep:]:
        if old.is_dir(): shutil.rmtree(old)

