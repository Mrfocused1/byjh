"""Audit regressions: exercise real routes against a disposable database."""
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

class GapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous_data=server.DATA
        cls.temp=tempfile.TemporaryDirectory();server.DATA=Path(cls.temp.name);server.RATES.clear();server.init()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
        cls.admin=cls.client();cls.call(cls.admin,'setup',{'name':'QA Owner','email':'gap-owner@example.invalid','password':'test-owner-password-123'})
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.temp.cleanup();server.DATA=cls.previous_data;server.RATES.clear()
    @staticmethod
    def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    @classmethod
    def call(cls,client,path,data=None):
        req=urllib.request.Request(cls.base+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','X-BYJH':'1'})
        try:
            with client.open(req) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def test_whitespace_password_roundtrip_and_change(self):
        client=self.client();password=' exact password with spaces '
        payload={'role':'member','name':'Whitespace QA','email':'space@example.invalid','password':password,'consent':True}
        self.assertEqual(self.call(client,'apply',payload)[0],201)
        self.call(client,'logout',{})
        self.assertEqual(self.call(client,'login',payload)[0],200,'An accepted password must remain usable verbatim')
        self.assertEqual(self.call(client,'password',{'current':password,'password':' second exact password '})[0],200)
        self.call(client,'logout',{});payload['password']=' second exact password '
        self.assertEqual(self.call(client,'login',payload)[0],200)
    def test_replacement_chains_cannot_mutate_other_assets(self):
        a='/assets/byjh/bliss.jpg';b='/assets/byjh/desire.jpg';c='/assets/byjh/dream.jpg'
        self.assertEqual(self.call(self.admin,'admin/media',{'source':a,'target':b})[0],200)
        self.assertEqual(self.call(self.admin,'admin/media',{'source':b,'target':c})[0],400,'Replacing a referenced original must not silently retarget an earlier replacement')
    def test_content_attribute_changes_do_not_match_inside_another_attribute(self):
        from cms import ContentPage
        source='<img title="A label alt=\'wrong\'" alt="Correct label" src="/assets/test.png">'
        field=next(f for f in ContentPage(source).fields if f['original']=='Correct label')
        result=ContentPage(source,{field['id']:'New label'}).rendered
        self.assertIn('alt="New label"',result)
        self.assertIn('title="A label alt=\'wrong\'"',result)
        self.assertNotIn('alt="Correct label"',result)
    def test_cms_includes_gallery_captions_and_chapter_labels(self):
        from cms import ContentPage
        source='<a data-caption="Original caption" data-panel-label="Original chapter" data-title="Original title">Photo</a>'
        fields=ContentPage(source).fields
        self.assertIn('Original caption',[f['original'] for f in fields])
        self.assertIn('Original chapter',[f['original'] for f in fields])
        self.assertIn('Original title',[f['original'] for f in fields])
    def test_public_templates_keep_existing_cms_keys_when_new_attributes_added(self):
        from cms import ContentPage
        source='<p>First</p><a data-caption="Caption">Second</a><p>Third</p>'
        fields={f['original']:f['id'] for f in ContentPage(source).fields}
        self.assertEqual(fields['First'],'f0');self.assertEqual(fields['Second'],'f1');self.assertEqual(fields['Third'],'f2')
    def test_entity_phrase_can_be_replaced_without_losing_legacy_edits(self):
        from cms import ContentPage
        source='<p>Music &amp; Artists</p><p>Later</p>'
        parsed=ContentPage(source,{'f0':'Events','f1':' Touring','f2':'End'})
        self.assertIn('Events &amp;  Touring',parsed.rendered)
        field=parsed.fields[0]
        self.assertEqual(field['original'],'Music & Artists')
        self.assertEqual(ContentPage(source,{field['id']:'New sector','f2':'End'}).rendered,'<p>New sector</p><p>End</p>')
    def test_legacy_ids_still_refer_to_the_same_original_text(self):
        from cms import ContentPage
        fixtures=json.loads((Path(__file__).parent/'cms-legacy-fields.json').read_text())
        count=0
        for page,originals in fixtures.items():
            parsed=ContentPage((server.DIST/server.PAGES[page][1]).read_text())
            for f in parsed.fields:
                if f['id'].startswith('f'):
                    self.assertEqual(f['original'],originals[f['id']],page+' '+f['id']);count+=1
        self.assertGreater(count,700)
    def test_shared_copy_preview_publish_and_script_escaping(self):
        page=next(p for p in self.call(self.admin,'admin/content')[1]['pages'] if p['id']=='interface')
        value='JOIN </script><script>window.injected=true</script> & us'
        status,result=self.call(self.admin,'admin/content',{'page':'interface','revision':page['revision'],'fields':{'member.join':value}})
        self.assertEqual(status,200)
        anon=self.client()
        def copy_from(client,path):
            import re
            with client.open(self.base+path) as response:markup=response.read().decode()
            self.assertNotIn('<script>window.injected=true',markup)
            return json.loads(re.search(r'window.BYJH_COPY=(.*?);</script>',markup).group(1))
        self.assertEqual(copy_from(anon,'/members/?preview=1')['member.join'],'Become a member')
        self.assertEqual(copy_from(self.admin,'/apply/?preview=1')['member.join'],value)
        self.assertEqual(self.call(self.admin,'admin/publish',{'page':'interface','revision':result['revision']})[0],200)
        self.assertEqual(copy_from(anon,'/members/')['member.join'],value)
        self.assertEqual(copy_from(anon,'/members/login/')['member.join'],value)

    def test_head_uses_same_host_policy_as_get(self):
        req=urllib.request.Request(self.base+'/',method='HEAD',headers={'Host':'untrusted.invalid'})
        try:
            with self.client().open(req) as response:status=response.status
        except urllib.error.HTTPError as e:status=e.code;e.close()
        self.assertEqual(status,403)
    def test_partial_profile_update_preserves_unsubmitted_fields(self):
        user=self.client();payload={'role':'member','name':'Profile QA','email':'profile@example.invalid','phone':'020 0000 0000','company':'Example','sector':'Travel','password':'profile-password-test','consent':True}
        self.call(user,'apply',payload)
        self.assertEqual(self.call(user,'account',{'name':'Profile QA edited','email':'profile@example.invalid'})[0],200)
        current=self.call(user,'account')[1]['user']
        self.assertEqual(current['phone'],payload['phone'])

if __name__=='__main__':unittest.main(verbosity=2)
