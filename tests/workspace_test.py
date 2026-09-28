"""Run with python3 -m unittest discover -s tests -p '*_test.py'. Uses a temporary database."""
import base64
import http.cookiejar
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();server.DATA=Path(cls.temp.name);server.init()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.admin=cls.client();cls.member=cls.client();cls.partner=cls.client();cls.anon=cls.client()
        cls.call(cls.admin,'setup',{'name':'QA Owner','email':'owner@example.invalid','password':'test-owner-password-123'})
        cls.member_user=cls.call(cls.member,'apply',{'role':'member','name':'QA Member','email':'member@example.invalid','password':'test-member-password-123','consent':True})[1]['user']
        cls.partner_user=cls.call(cls.partner,'apply',{'role':'partner','name':'QA Partner','company':'QA Studio','email':'partner@example.invalid','password':'test-partner-password-123','consent':True})[1]['user']
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.temp.cleanup()
    @staticmethod
    def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    @classmethod
    def call(cls,client,path,data=None,headers=None):
        req=urllib.request.Request(cls.base+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers=headers if headers is not None else {'Content-Type':'application/json','X-BYJH':'1'})
        try:
            with client.open(req) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def test_access_boundaries(self):
        self.assertEqual(self.call(self.anon,'admin/people')[0],401)
        self.assertEqual(self.call(self.member,'admin/people')[0],403)
        self.assertEqual(self.call(self.partner,'admin/content')[0],403)
        self.assertEqual(self.call(self.member,'admin/person',self.partner_user)[0],403)
        self.assertEqual(self.call(self.anon,'setup',{})[0],409)
    def test_application_validation(self):
        payload={'role':'admin','name':'Bad','email':'bad@example.invalid','password':'long enough for test','consent':True}
        self.assertEqual(self.call(self.anon,'apply',payload)[0],400)
        payload['role']='partner';self.assertEqual(self.call(self.anon,'apply',payload)[0],400)
        payload.update(role='member',consent=False);self.assertEqual(self.call(self.anon,'apply',payload)[0],400)
        payload.update(consent=True,password='short');self.assertEqual(self.call(self.anon,'apply',payload)[0],400)
    def test_content_draft_publish_escaping_and_stale_write(self):
        page=self.call(self.admin,'admin/content')[1]['pages'][1]
        f=next(f for f in page['fields'] if '/ h1' in f['label'])
        draft={f['id']:'NEW <script>alert(1)</script> MEMBERS'}
        r=self.call(self.admin,'admin/content',{'page':page['id'],'revision':page['revision'],'fields':draft})
        self.assertEqual(r[0],200)
        public=self.anon.open(self.base+'/members/').read().decode()
        self.assertNotIn('NEW &lt;script&gt;',public)
        preview=self.admin.open(self.base+'/members/?preview=1').read().decode()
        self.assertIn('NEW &lt;script&gt;',preview)
        anonymous_preview=self.anon.open(self.base+'/members/?preview=1').read().decode()
        self.assertNotIn('NEW &lt;script&gt;',anonymous_preview)
        self.assertEqual(self.call(self.admin,'admin/publish',{'page':'members','revision':page['revision']})[0],409)
        self.assertEqual(self.call(self.admin,'admin/publish',{'page':'members','revision':r[1]['revision']})[0],200)
        self.assertIn('NEW &lt;script&gt;',self.anon.open(self.base+'/members/').read().decode())
    def test_csrf_protection(self):
        self.assertEqual(self.call(self.admin,'logout',{},headers={'Content-Type':'application/json'})[0],403)
        self.assertEqual(self.call(self.admin,'logout',{},headers={'X-BYJH':'1','Origin':'https://other.invalid'})[0],403)
    def test_member_approval_requests_and_private_notes(self):
        self.assertEqual(self.call(self.member,'requests',{'subject':'Trip','message':'London'})[0],403)
        p=self.member_user.copy();p.update(status='active',notes='Private team information')
        self.assertEqual(self.call(self.admin,'admin/person',p)[0],200)
        account=self.call(self.member,'account')[1]
        self.assertEqual(account['user']['status'],'active');self.assertNotIn('notes',account['user'])
        self.assertEqual(self.call(self.member,'requests',{'subject':'Trip','message':'London'})[0],201)
        req=self.call(self.admin,'admin/requests')[1]['requests'][0]
        self.assertEqual(self.call(self.admin,'admin/request',{'id':req['id'],'reply':'We are on it.','status':'in-progress'})[0],200)
        self.assertEqual(self.call(self.member,'account')[1]['requests'][0]['reply'],'We are on it.')
        self.assertEqual(self.call(self.partner,'account')[1]['requests'],[])
        p['status']='suspended';self.call(self.admin,'admin/person',p)
        self.assertEqual(self.call(self.member,'requests',{'subject':'Trip','message':'London'})[0],403)
    def test_profile_cannot_elevate_role_or_status(self):
        p=self.partner_user.copy();p.update(role='admin',status='active',notes='Injected')
        self.assertEqual(self.call(self.partner,'account',p)[0],200)
        u=self.call(self.partner,'account')[1]['user'];self.assertEqual(u['role'],'partner');self.assertEqual(u['status'],'pending');self.assertNotIn('notes',u)
    def test_media_upload_validation_and_restore(self):
        self.assertEqual(self.call(self.member,'admin/upload',{'name':'test.png','data':''})[0],403)
        self.assertEqual(self.call(self.admin,'admin/upload',{'name':'bad.svg','data':base64.b64encode(b'<svg><script/></svg>').decode()})[0],400)
        raw=(server.DIST/'assets/byjh/logo-dark.png').read_bytes()
        r=self.call(self.admin,'admin/upload',{'name':'test.png','data':base64.b64encode(raw).decode()});self.assertEqual(r[0],201)
        url=r[1]['url'];self.assertEqual(self.anon.open(self.base+url).read(),raw)
        source='/assets/byjh/logo-light.png';self.assertEqual(self.call(self.admin,'admin/media',{'source':source,'target':url})[0],200)
        self.assertIn(url,self.anon.open(self.base+'/').read().decode())
        self.assertEqual(self.call(self.admin,'admin/media',{'source':source,'target':source})[0],200)
    def test_real_analytics_excludes_admin(self):
        before=self.call(self.admin,'admin/analytics')[1]['views']
        event={'path':'/gallery/','device':'mobile','referrer':'https://example.invalid/private?secret=hidden'}
        self.call(self.admin,'track',event);self.call(self.anon,'track',event)
        after=self.call(self.admin,'admin/analytics')[1]
        self.assertEqual(after['views'],before+1)
        self.assertEqual(after['sources'][0]['label'],'example.invalid')
    def test_wrong_role_login_and_logout(self):
        client=self.client()
        payload={'email':'owner@example.invalid','password':'test-owner-password-123','role':'member'}
        self.assertEqual(self.call(client,'login',payload)[0],401)
        payload['role']='admin';self.assertEqual(self.call(client,'login',payload)[0],200)
        self.assertEqual(self.call(client,'logout',{})[0],200)
        self.assertEqual(self.call(client,'admin/people')[0],401)
    def test_video_byte_ranges(self):
        req=urllib.request.Request(self.base+'/assets/gallery/DEF2KDAOStm.mp4',headers={'Range':'bytes=0-255'})
        with self.anon.open(req) as response:
            self.assertEqual(response.status,206)
            self.assertEqual(response.headers['Accept-Ranges'],'bytes')
            self.assertEqual(len(response.read()),256)
        req=urllib.request.Request(self.base+'/assets/gallery/DEF2KDAOStm.mp4',headers={'Range':'bytes=999999999999-'})
        with self.assertRaises(urllib.error.HTTPError) as caught:self.anon.open(req)
        self.assertEqual(caught.exception.code,416);caught.exception.close()

if __name__=='__main__':unittest.main(verbosity=2)
