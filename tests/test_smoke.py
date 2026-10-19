from fastapi.testclient import TestClient
from pathlib import Path
from PIL import Image
from io import BytesIO
import sys,os,time
os.environ['DEMO_MODE']='1'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import main
client=TestClient(main.app)
def check(x,msg):
 assert x,msg
 print('PASS:',msg)
def request(method,path,token=None,**kw):
 headers={'Authorization':'Bearer '+token} if token else {}
 return client.request(method,path,headers=headers,**kw)
tokens={}
for role in ('teacher','worker','admin','director'):
 r=request('POST','/api/login',json={'login':role,'password':'1234'})
 check(r.status_code==200,f'quick login {role}: {r.status_code} {r.text[:120]}'); tokens[role]=r.json()['token']
T,W,A,D=[tokens[k] for k in ('teacher','worker','admin','director')]
r=request('POST','/api/register',json={'name':'Test User','login':'sixpwduser','password':'abc123','role':'teacher'})
check(r.status_code==200,'6 character password accepted')
r=request('POST','/api/register',json={'name':'Unsafe Worker','login':'unsafe-worker','password':'abc123','role':'worker'})
check(r.status_code==200 and r.json().get('pending'),'worker role request stays pending')
r=request('POST','/api/admin/rooms',A,json={'number':'000','floor':0})
check(r.status_code==200,f'create floor 0: {r.text}')
roomid=r.json().get('id')
r=request('GET','/api/rooms?floor=0');check(r.status_code==200 and len(r.json())==1 and r.json()[0]['floor']==0,'floor zero filter')
roomid=r.json()[0]['id']
check(request('POST','/api/admin/equipment',T,json={'room_id':roomid,'name':'Проектор'}).status_code==403,'teacher cannot edit equipment')
check(request('POST','/api/admin/equipment',A,json={'room_id':roomid,'name':'Проектор','condition':'attention'}).status_code==200,'add equipment')
check(len(request('GET',f'/api/rooms/{roomid}/passport',T).json()['equipment'])==1,'passport reads equipment')
check(request('POST','/api/admin/inventory',A,json={'name':'Петля','quantity':5,'min_quantity':2}).status_code==200,'create inventory')
itemid=request('GET','/api/inventory',W).json()[0]['id']
check(request('PATCH',f'/api/admin/inventory/{itemid}',A,json={'delta':-2}).status_code==200,'decrease stock')
check(request('PATCH',f'/api/admin/inventory/{itemid}',A,json={'delta':-200}).status_code==409,'stock cannot go negative')
check(request('POST','/api/admin/maintenance',D,json={'room_id':roomid,'title':'Проверить проектор','due_at':'2026-11-01'}).status_code==200,'director schedules maintenance')
m=request('GET','/api/maintenance',W).json()[0]['id']
check(request('PATCH',f'/api/maintenance/{m}/done',W).status_code==200,'worker completes inspection')
check(request('GET','/api/admin/ai-usage',T).status_code==403,'teacher cannot see AI stats')
check(request('GET','/api/admin/ai-usage',D).status_code==200,'director AI stats')
check(main._normalize_ai({'tools':'string','materials':[None,{'object':1},'Заменить']})['tools']==[],'AI list type validation')
check(main._normalize_ai({'tools':'string','materials':[None,{'object':1},'Заменить']})['materials']==['Заменить'],'AI list filters bad items')
# new request without API key: immediate + safe no AI
r=request('POST','/api/requests',T,data={'room_id':str(roomid),'description':'Дверь не закрывается','priority':'medium','category':'windows_doors'})
check(r.status_code==200,f'create request without AI: {r.text[:120]}')
rid=r.json()['id']
check(request('GET',f'/api/requests/{rid}',T).status_code==200,'teacher views own ticket')
check(request('GET',f'/api/requests/{rid}/attempts',T).status_code==200,'repair attempts authorized')
check(request('GET',f'/api/requests/{rid}/attempts',r.json().get('token','')).status_code==401,'attempts denied without token')
# update workflow, photo after
check(request('PATCH',f'/api/requests/{rid}',W,json={'status':'accepted'}).status_code==200,'worker accepts')
check(request('PATCH',f'/api/requests/{rid}',W,json={'status':'working'}).status_code==200,'worker starts')
img=BytesIO();Image.new('RGB',(180,180),'white').save(img,format='PNG');img.seek(0)
r=request('POST',f'/api/requests/{rid}/complete',W,data={'resolution':'Петли заменены','materials':'Петля'},files={'after_image':('after.png',img,'image/png')})
check(r.status_code==200,f'complete with photo {r.status_code}: {r.text[:200]}')
check(request('POST',f'/api/requests/{rid}/confirm',T,json={'accepted':False,'comment':'Снова заедает'}).status_code==200,'teacher returns work')
check(request('GET',f'/api/requests/{rid}/attempts',T).json()[-1]['outcome']=='rework','attempt marked rework')
check(request('PATCH',f'/api/requests/{rid}',W,json={'status':'accepted'}).status_code==200,'rework accepted')
check(request('PATCH',f'/api/requests/{rid}',W,json={'status':'working'}).status_code==200,'rework started')
img=BytesIO();Image.new('RGB',(180,180),'blue').save(img,format='PNG');img.seek(0)
check(request('POST',f'/api/requests/{rid}/complete',W,data={'resolution':'Повторная регулировка','materials':'Отвёртка'},files={'after_image':('after.png',img,'image/png')}).status_code==200,'rework completed')
check(request('POST',f'/api/requests/{rid}/confirm',T,json={'accepted':True}).status_code==200,'repair accepted')
check(len(request('GET',f'/api/requests/{rid}/attempts',T).json())==2,'two repair attempts')
# password revokes old token
pending = next(u for u in request('GET','/api/admin/users',A).json() if u['login']=='sixpwduser')
check(request('POST','/api/login',json={'login':'sixpwduser','password':'abc123'}).status_code==403,'signup denied until approved')
check(request('PATCH',f"/api/admin/users/{pending['id']}?role=teacher",A).status_code==200,'admin approves signup')
newtoken=request('POST','/api/login',json={'login':'sixpwduser','password':'abc123'}).json()['token']
check(request('PATCH','/api/profile/password',newtoken,json={'old_password':'abc123','new_password':'def456'}).status_code==200,'change password six symbols')
check(request('GET','/api/me',newtoken).status_code==401,'previous token revoked')
check(request('POST','/api/login',json={'login':'sixpwduser','password':'def456'}).status_code==200,'login new password')
# asynchronous completion simulated (no provider call)
main.AI_API_KEY='fake'
def fake_analysis(path,description=''):
 time.sleep(.25)
 return main._normalize_ai({'problem':'Протестировано','tools':['Отвёртка'],'category':'furniture'})
main.analyze_image=fake_analysis
img=BytesIO();Image.new('RGB',(200,200),'green').save(img,format='PNG');img.seek(0)
t0=time.monotonic();r=request('POST','/api/requests',T,data={'room_id':str(roomid),'description':'Стул шатается'},files={'image':('new.png',img,'image/png')});elapsed=time.monotonic()-t0
check(r.status_code==200 and elapsed<.25,f'AI does not block ticket creation ({elapsed:.3f}s)')
rid2=r.json()['id']
for _ in range(20):
 time.sleep(.1)
 if request('GET',f'/api/requests/{rid2}',T).json()['ai_status']=='ok':break
check(request('GET',f'/api/requests/{rid2}',T).json()['detected_problem']=='Протестировано','async AI result stored')
check(request('GET','/api/admin/ai-usage',D).json()['items'][0]['requests']>=1,'AI usage recorded')
print('ALL TESTS PASSED')
