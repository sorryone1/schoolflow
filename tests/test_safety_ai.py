"""Regression tests for conservative safety escalation (no external AI)."""
import os, tempfile, sys, json
from pathlib import Path
os.environ['SCHOOL_PLUS_DATA_DIR'] = tempfile.mkdtemp(prefix='schoolflow_safety_')
os.environ['DEMO_MODE']='1'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import main
from fastapi.testclient import TestClient
client = TestClient(main.app)
def tok(role):
    r=client.post('/api/login',json={'login':role,'password':'1234'})
    assert r.status_code==200, r.text
    return r.json()['token']
T=tok('teacher'); A=tok('admin'); D=tok('director')
room=client.get('/api/rooms').json()[0]['id']
r=client.post('/api/requests',headers={'Authorization':'Bearer '+T},data={'room_id':str(room),'description':'Проверка потолка'})
assert r.status_code==200,r.text
rid=r.json()['id']
assert main._normalize_ai({'danger_level':'low','problem':'Стул сломан'})['danger_level']=='low'
assert main._normalize_ai({'danger_level':'low','problem':'Потолок упал'})['danger_level']=='critical'
assert main._normalize_ai({'danger_level':'low','problem':'Провис потолок'})['danger_level']=='high'
assert main._normalize_ai({'danger_level':'critical','problem':'Поломка'})['requires_human_review']==1
result=main._normalize_ai({'problem':'Потолок упал','priority':'low','danger_level':'low','tools':['Осмотр зоны специалистом']})
main.analyze_image=lambda *args,**kw: result
main.schedule_ai_analysis(rid,'fake.png','Потолок упал')
import time
for _ in range(40):
    time.sleep(.05)
    if client.get(f'/api/requests/{rid}',headers={'Authorization':'Bearer '+T}).json().get('ai_status')=='ok':break
item=client.get(f'/api/requests/{rid}',headers={'Authorization':'Bearer '+T}).json()
assert item['ai_danger_level']=='critical',item
assert json.loads(item['ai_teacher_actions'])[0].startswith('Немедленно')
assert item['ai_human_review']==1
for role,token in [('admin',A),('director',D)]:
    c=main.db()
    notes=c.execute('SELECT title FROM notifications WHERE user_id=(SELECT id FROM users WHERE role=?)',(role,)).fetchall();c.close()
    assert any('СРОЧНО' in x['title'] for x in notes),(role,notes)
print('SAFETY AI TESTS PASSED')
