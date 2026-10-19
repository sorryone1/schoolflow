"""Run standalone: python tests/test_director_report.py (isolated SQLite)."""
import os,sys,tempfile
from pathlib import Path
os.environ['SCHOOL_PLUS_DATA_DIR']=tempfile.mkdtemp(prefix='schoolflow_director_')
os.environ['DEMO_MODE']='1'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import main
from fastapi.testclient import TestClient
client=TestClient(main.app)
def auth(role):
    r=client.post('/api/login',json={'login':role,'password':'1234'})
    assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['token']}
for role in ('director','admin'):
    headers=auth(role)
    r=client.get('/api/dashboard/director',headers=headers)
    assert r.status_code==200,r.text
    assert r.json()['stats']['total']==0
    report=client.get('/api/export/director.pdf',headers=headers)
    assert report.status_code==200,report.text[:100]
    assert report.content.startswith(b'%PDF')
for role in ('teacher','worker'):
    headers=auth(role)
    assert client.get('/api/dashboard/director',headers=headers).status_code==403
    assert client.get('/api/export/director.pdf',headers=headers).status_code==403
print('DIRECTOR REPORT TESTS PASSED')
