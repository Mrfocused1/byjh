"""CMS wording must never change permissions, data or escaping boundaries."""
import http.cookiejar,json,sys,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server,copybook

class CopyTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.previous=server.DATA;cls.temp=tempfile.TemporaryDirectory();server.DATA=Path(cls.temp.name);server.RATES.clear();server.init()
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);cls.base='http://127.0.0.1:'+str(cls.http.server_port);threading.Thread(target=cls.http.serve_forever,daemon=True).start()
  cls.admin=cls.client();cls.anon=cls.client();cls.call(cls.admin,'setup',{'name':'Copy QA','email':'copy-owner@example.invalid','password':'copy-password-123'})
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.temp.cleanup();server.DATA=cls.previous;server.RATES.clear()
 @staticmethod
 def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 @classmethod
 def call(cls,client,route,data=None):
  req=urllib.request.Request(cls.base+'/api/'+route,data=json.dumps(data).encode() if data is not None else None,headers={'X-BYJH':'1','Content-Type':'application/json'})
  try:
   with client.open(req) as res:return res.status,json.load(res)
  except urllib.error.HTTPError as error:
   with error:return error.code,json.load(error)
 def save(self,page,fields,publish=False):
  entry=next(p for p in self.call(self.admin,'admin/content')[1]['pages'] if p['id']==page)
  status,result=self.call(self.admin,'admin/content',{'page':page,'revision':entry['revision'],'fields':fields})
  if publish and status==200:self.assertEqual(self.call(self.admin,'admin/publish',{'page':page,'revision':result['revision']})[0],200)
  return status,result
 def test_placeholder_validation_requires_the_existing_names(self):
  self.assertEqual(self.save('copy-account',{'ui.account.93f791a4f1':'Hello {value1}.'})[0],200)
  for value in ['Hello {unknown}','Hello','Hello {value1']:
   self.assertEqual(self.save('copy-account',{'ui.account.93f791a4f1':value})[0],400)
 def test_anonymous_errors_follow_published_copy_only(self):
  key=copybook.ERROR_BY_TEXT['Please sign in to continue.']
  self.assertEqual(self.save('copy-system',{key:'Please access your account.'})[0],200)
  self.assertEqual(self.call(self.anon,'admin/people')[1]['error'],'Please sign in to continue.')
  self.assertEqual(self.save('copy-system',{key:'Please access your account.'},True)[0],200)
  status,data=self.call(self.anon,'admin/people');self.assertEqual(status,401);self.assertEqual(data['error'],'Please access your account.');self.assertEqual(data['errorKey'],key)
 def test_account_preview_is_admin_only_and_has_no_real_account(self):
  status,result=self.call(self.admin,'account?preview=1&role=partner&status=suspended')
  self.assertEqual(status,200);self.assertTrue(result['preview']);self.assertEqual(result['user']['id'],'preview');self.assertEqual(result['user']['status'],'suspended')
  self.assertEqual(self.call(self.anon,'account?preview=1&role=partner')[0],401)
 def test_preview_query_cannot_mutate_owner(self):
  self.assertEqual(self.call(self.admin,'account?preview=1',{'name':'Wrong owner name','email':'wrong@example.invalid'})[0],400)
  self.assertEqual(self.call(self.admin,'account')[1]['user']['name'],'Copy QA')
 def test_new_activity_never_parses_names_as_system_messages(self):
  with server.connect() as db:
   server.audit(db,{'name':'Copy QA'},'personUpdated',name='media · Alice',status='active')
   row=db.execute('SELECT action FROM activity ORDER BY id DESC LIMIT 1').fetchone()
   record=json.loads(row['action']);self.assertEqual(record['key'],'activity.personUpdated');self.assertEqual(record['params']['name'],'media · Alice')
 def test_enum_label_changes_do_not_modify_permissions(self):
  self.save('copy-shared',{'ui.shared.enum.status.pending':'Approved in appearance only'},True)
  member=self.client();result=self.call(member,'apply',{'role':'member','name':'Enum QA','email':'enum@example.invalid','password':'copy-password-123','consent':True})
  self.assertEqual(result[1]['user']['status'],'pending');self.assertEqual(self.call(member,'requests',{'subject':'Blocked','message':'Not approved'})[0],403)
 def test_historical_activity_keeps_personal_data_as_parameters(self):
  copy={**copybook.DEFAULTS,'activity.personUpdated':'Account {name}: {status}','ui.shared.enum.status.active':'Enabled'}
  name='Name · with <symbols>'
  legacy='Updated '+name+' · active';record=copybook.activity_record(legacy)
  self.assertEqual(record['params']['name'],name)
  self.assertEqual(copybook.activity_text(copy,legacy),'Account '+name+': Enabled')
  self.assertEqual(copybook.activity_text(copy,json.dumps(record)),'Account '+name+': Enabled')
 def test_catalog_contains_no_executable_path_or_markup_fragments(self):
  import re
  for key,value in copybook.DEFAULTS.items():
   self.assertFalse(re.match(r'^[MLAQC] [-\d{]',value),key)
   copybook.validate(value,value)
 def test_all_access_page_titles_are_editable(self):
  titles={'/apply/':'document.apply','/admin/':'document.admin','/admin/login/':'document.adminLogin','/members/login/':'document.memberLogin','/partners/login/':'document.partnerLogin','/account/':'document.account','/login/':'document.login'}
  self.save('copy-system',{key:'Editable <title> '+key for key in titles.values()},True)
  for path,key in titles.items():
   with self.anon.open(self.base+path) as response:body=response.read().decode()
   self.assertIn('<title>Editable &lt;title&gt; '+key+'</title>',body)
 def test_404_page_escapes_published_wording(self):
  self.save('copy-system',{'error.pageNotFoundTitle':'Missing <script>not executable</script>'},True)
  try:self.anon.open(self.base+'/missing-audit-page')
  except urllib.error.HTTPError as error:
   with error:body=error.read().decode();self.assertEqual(error.code,404);self.assertIn('&lt;script&gt;',body);self.assertNotIn('<script>not executable',body)

if __name__=='__main__':unittest.main(verbosity=2)
