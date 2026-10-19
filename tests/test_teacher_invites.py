"""Production-only checks: invites gate registration, single use and role access."""
import os,sys,tempfile
from pathlib import Path
os.environ['SCHOOL_PLUS_DATA_DIR']=tempfile.mkdtemp(prefix='schoolflow_invites_')
os.environ['DEMO_MODE']='0'
os.environ['SCHOOL_PLUS_SECRET']='local-test-secret-not-a-production-key'
os.environ['SCHOOL_PLUS_ADMIN_LOGIN']='inviteadmin'
os.environ['SCHOOL_PLUS_ADMIN_PASSWORD']='a-test-password-longer-than-12'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import main
from fastapi.testclient import TestClient
c=TestClient(main.app)
def post(endpoint,payload=None,token=None):
    return c.post(endpoint,json=payload,headers={'Authorization':'Bearer '+token} if token else {})
a=post('/api/login',{'login':'inviteadmin','password':'a-test-password-longer-than-12'})
assert a.status_code==200,a.text
admin=a.json()['token']
base={'name':'Тестовый Учитель','login':'teacher-test','password':'my-strong-pass','role':'teacher'}
assert post('/api/register',base).status_code==403
assert post('/api/admin/teacher-invites').status_code==401
issued=post('/api/admin/teacher-invites',token=admin)
assert issued.status_code==200,issued.text
code=issued.json()['code']
assert len(code)>=16
assert post('/api/register',dict(base,invite_code=code+'BAD')).status_code==403
signed=post('/api/register',dict(base,invite_code=code))
assert signed.status_code==200,signed.text
assert post('/api/register',dict(base,login='teacher-test-2',invite_code=code)).status_code==403
assert post('/api/login',{'login':'teacher-test','password':'my-strong-pass'}).status_code==200
room=c.get('/api/rooms').json()[0]['id']
t=signed.json()['token']
created=c.post('/api/requests',headers={'Authorization':'Bearer '+t},data={'room_id':str(room),'description':'Проверка видимости заявки администратору'})
assert created.status_code==200,created.text
rid=created.json()['id']
h={'Authorization':'Bearer '+admin}
assert any(r['id']==rid for r in c.get('/api/requests',headers=h).json())
assert c.get(f'/api/requests/{rid}',headers=h).status_code==200
with main.db() as db:
    record=db.execute('SELECT token_hash,used_at FROM teacher_invites').fetchone()
    assert record['used_at'] and code not in record['token_hash']
assert c.get('/api/admin/teacher-invites',headers={'Authorization':'Bearer '+signed.json()['token']}).status_code==403
print('TEACHER INVITE TESTS PASSED')
