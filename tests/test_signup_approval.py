import os, tempfile, sys
from pathlib import Path
os.environ['SCHOOL_PLUS_DATA_DIR']=tempfile.mkdtemp(prefix='school_v3_')
os.environ['DEMO_MODE']='0'
os.environ['SCHOOL_PLUS_SECRET']='local-test-secret-not-production'
os.environ['SCHOOL_PLUS_ADMIN_LOGIN']='testadmin'
os.environ['SCHOOL_PLUS_ADMIN_PASSWORD']='long-test-password-1234'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from fastapi.testclient import TestClient
import main
c=TestClient(main.app)
a=c.post('/api/login',json={'login':'testadmin','password':'long-test-password-1234'})
assert a.status_code==200,a.text
h={'Authorization':'Bearer '+a.json()['token']}
r=c.post('/api/register',json={'name':'Новый сотрудник','login':'newstaff','password':'password-123','role':'admin','invite_code':'anything'})
assert r.status_code==200,r.text
assert r.json()['pending'] is True
assert 'token' not in r.json()
assert c.post('/api/login',json={'login':'newstaff','password':'password-123'}).status_code==403
pending=next(x for x in c.get('/api/admin/users',headers=h).json() if x['login']=='newstaff')
assert pending['approved']==0 and pending['role']!='admin'
assert c.get('/api/requests',headers={'Authorization':'Bearer totally-invalid'}).status_code==401
assert c.patch(f"/api/admin/users/{pending['id']}?role=director").status_code==401
assert c.patch(f"/api/admin/users/{pending['id']}?role=admin",headers=h).status_code==400
approve=c.patch(f"/api/admin/users/{pending['id']}?role=worker",headers=h)
assert approve.status_code==200,approve.text
login=c.post('/api/login',json={'login':'newstaff','password':'password-123'})
assert login.status_code==200,login.text
assert login.json()['user']['role']=='worker'
print('SIGNUP APPROVAL TEST PASSED')
