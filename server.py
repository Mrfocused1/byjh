#!/usr/bin/env python3
"""BYJH local CRM. Python 3.9+, SQLite, no third-party runtime dependencies."""
import argparse
import html
import copybook
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from cms import ContentPage, InterfaceCopy

ROOT=Path(__file__).resolve().parent
DIST=ROOT/'dist'
DATA=Path(os.environ.get('BYJH_DATA_DIR', ROOT/'data'))
PAGES={'home':('Home','index.html','/'),'members':('Members','members/index.html','/members/'),'partners':('Partners','partners/index.html','/partners/'),'gallery':('Gallery','gallery/index.html','/gallery/'),'contact':('Contact','contact/index.html','/contact/')}
PAGES.update(copybook.COPY_PAGES)
RATES=defaultdict(deque)
def parse_content(page,values=None):
    parser=InterfaceCopy if page in copybook.COPY_PAGES else ContentPage
    return parser((DIST/PAGES[page][1]).read_text(),values)
def inject_copy(markup,db,preview=False,static=False):
    copy=copybook.values(db,preview)
    if static:
        for original,key in {'Private office — BYJH': 'admin', 'Member access — BYJH': 'memberLogin', 'Partner access — BYJH': 'partnerLogin', 'Your account — BYJH': 'account', 'Your introduction — BYJH': 'apply', 'Admin access — BYJH': 'adminLogin', 'Account access — BYJH': 'login'}.items():markup=markup.replace('<title>'+original+'</title>','<title>'+html.escape(copybook.text(copy,'document.'+key))+'</title>')
        markup=markup.replace('Opening BYJH…',html.escape(copybook.text(copy,'loading.open')))
    config=json.dumps(copy).replace('<','\\u003c')
    extra='<script>window.BYJH_COPY='+config+';</script><script>window.BYJH_COPY_PREVIEW='+('true' if preview else 'false')+';</script><script src="/copy.js"></script>'
    return markup.replace('</head>',extra+'</head>',1)
def now(): return datetime.now(timezone.utc).isoformat(timespec='seconds')
@contextmanager
def connect():
    db=sqlite3.connect(DATA/'byjh.sqlite3',timeout=15)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()
def init():
    if not hasattr(hashlib,'scrypt'):
        raise RuntimeError('This Python build does not support scrypt. Use Start BYJH.command or a Python build with OpenSSL support (for example Homebrew Python).')
    DATA.mkdir(parents=True,exist_ok=True)
    (DATA/'uploads').mkdir(exist_ok=True)
    os.chmod(DATA,0o700)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,name TEXT NOT NULL,phone TEXT DEFAULT '',company TEXT DEFAULT '',sector TEXT DEFAULT '',website TEXT DEFAULT '',message TEXT DEFAULT '',status TEXT NOT NULL,notes TEXT DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS content(page TEXT PRIMARY KEY,draft TEXT DEFAULT '{}',published TEXT DEFAULT '{}',revision INTEGER DEFAULT 0,updated TEXT);
        CREATE TABLE IF NOT EXISTS media(source TEXT PRIMARY KEY,target TEXT NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS uploads(url TEXT PRIMARY KEY,name TEXT NOT NULL,size INTEGER NOT NULL,created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,path TEXT NOT NULL,event TEXT NOT NULL,device TEXT NOT NULL,referrer TEXT DEFAULT '',created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT DEFAULT 'new',reply TEXT DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,created TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
        CREATE INDEX IF NOT EXISTS idx_requests_user_created ON requests(user_id,created);
        CREATE INDEX IF NOT EXISTS idx_events_event_created ON events(event,created);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        CREATE INDEX IF NOT EXISTS idx_users_created ON users(created);
        ''')
        for page in PAGES: db.execute('INSERT OR IGNORE INTO content(page) VALUES(?)',(page,))
    os.chmod(DATA/'byjh.sqlite3',0o600)
def password_hash(password):
    salt=secrets.token_bytes(16)
    return salt.hex()+':'+hashlib.scrypt(password.encode(),salt=salt,n=16384,r=8,p=1).hex()
def password_ok(password,stored):
    salt,digest=stored.split(':')
    return hmac.compare_digest(hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex(),digest)
def public_user(row,admin=False):
    result=dict(row)
    result.pop('password',None)
    if not admin: result.pop('notes',None)
    return result
def audit(db,user,key,**params):
    record={'key':'activity.'+key,'params':params}
    db.execute('INSERT INTO activity(actor,action,created) VALUES(?,?,?)',(user['name'],json.dumps(record),now()))
def clean(data,key,limit=300,required=False):
    value=data.get(key,'')
    if not isinstance(value,str): raise ValueError('Invalid '+key)
    value=value.strip()
    if len(value)>limit or (required and not value): raise ValueError('Please provide a valid '+key+'.')
    return value
def email(data):
    value=clean(data,'email',254,True).lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value): raise ValueError('Please enter a valid email address.')
    return value
def validate_password(value):
    if not isinstance(value,str) or not 12<=len(value)<=128: raise ValueError('Use a password with 12–128 characters.')
    return value
def submitted_password(data,key='password'):
    value=data.get(key)
    if not isinstance(value,str) or not 1<=len(value)<=128:raise ValueError('Please enter your password.')
    return value
def media_list(db):
    changes={r['source']:r['target'] for r in db.execute('SELECT * FROM media')}
    result=[]
    for p in sorted((DIST/'assets').rglob('*')):
        if p.is_file() and p.suffix.lower() in ('.jpg','.jpeg','.png','.webp','.svg','.gif','.mp4','.webm'):
            src='/'+p.relative_to(DIST).as_posix()
            result.append({'url':src,'name':p.name,'size':p.stat().st_size,'type':'video' if p.suffix in ('.mp4','.webm') else 'image','current':changes.get(src,src),'replaced':src in changes})
    for row in db.execute('SELECT * FROM uploads ORDER BY created DESC'):
        r=dict(row);r.update(type='video' if Path(r['url']).suffix in ('.mp4','.webm') else 'image',current=r['url'],replaced=False)
        result.append(r)
    return result
def replace_media(source,db):
    mapping={r['source']:r['target'] for r in db.execute('SELECT * FROM media')}
    if not mapping:return source
    return re.sub('|'.join(re.escape(k) for k in sorted(mapping,key=len,reverse=True)),lambda m:mapping[m.group()],source)

class Handler(SimpleHTTPRequestHandler):
    server_version='BYJH'
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(DIST),**kwargs)
    def log_message(self,fmt,*args): pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Frame-Options','SAMEORIGIN')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def reply(self,data,status=200,cookie=None):
        if isinstance(data,dict) and 'error' in data:
            key,params=copybook.error(str(data['error']))
            try:
                with connect() as db:copy=copybook.values(db,self.is_preview(db))
            except (sqlite3.Error,ValueError):copy=copybook.DEFAULTS
            data={**data,'error':copybook.error_text(copy,key,params),'errorKey':key,'errorParams':params}
        raw=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers()
        if self.command!='HEAD':self.wfile.write(raw)
    def text_reply(self,value,mime='text/html; charset=utf-8'):
        raw=value.encode();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.end_headers()
        if self.command!='HEAD':self.wfile.write(raw)
    def file_reply(self,path):
        """Single byte ranges allow native video seeking, including mobile Safari."""
        size=path.stat().st_size;start=0;end=size-1;status=200
        requested=self.headers.get('Range')
        if requested:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
            try:
                if not match or not any(match.groups()):raise ValueError()
                a,b=match.groups()
                if a:start=int(a);end=min(int(b),size-1) if b else size-1
                else:start=max(0,size-int(b))
                if start>end or start>=size:raise ValueError()
                status=206
            except ValueError:
                self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
        self.send_response(status);self.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream');self.send_header('Accept-Ranges','bytes');self.send_header('Content-Length',str(end-start+1))
        if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command=='HEAD':return
        try:
            with path.open('rb') as file:
                file.seek(start);remaining=end-start+1
                while remaining>0:
                    chunk=file.read(min(256*1024,remaining))
                    if not chunk:break
                    self.wfile.write(chunk);remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError):pass
    def session(self,db):
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:return None
        token=cookie.get('byjh_session')
        if not token:return None
        digest=hashlib.sha256(token.value.encode()).hexdigest()
        return db.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',(digest,time.time())).fetchone()
    def login_cookie(self,db,user):
        token=secrets.token_urlsafe(32)
        db.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
        db.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],time.time()+43200))
        return 'byjh_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'
    def rate(self,scope,limit):
        q=RATES[(self.client_address[0],scope)];t=time.time()
        while q and q[0]<t-900:q.popleft()
        if len(q)>=limit: self.reply({'error':'Too many attempts. Please try again in 15 minutes.'},429);return False
        q.append(t);return True
    def is_preview_request(self):return self.headers.get('X-BYJH-Preview')=='1' or parse_qs(urlparse(self.path).query).get('preview')==['1']
    def is_preview(self,db):
        wanted=self.is_preview_request()
        user=self.session(db) if wanted else None
        return bool(user and user['role']=='admin')
    def send_error(self,code,message=None,explain=None):
        if code!=404:return super().send_error(code,message,explain)
        try:
            with connect() as db:copy=copybook.values(db,self.is_preview(db))
        except (sqlite3.Error,ValueError):copy=copybook.DEFAULTS
        title=html.escape(copybook.text(copy,'error.pageNotFoundTitle'));description=html.escape(copybook.text(copy,'error.pageNotFound'));link=html.escape(copybook.text(copy,'error.pageNotFoundLink'))
        body=f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><link rel="stylesheet" href="/workspace.css"><main class="page"><h1>{title}</h1><p>{description}</p><a class="btn primary" href="/">{link}</a></main></html>'.encode()
        self.send_response(404);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)
    def do_GET(self):
        path=unquote(urlparse(self.path).path)
        # Local-only service; reject foreign Host values as well as cross-origin writes.
        if self.headers.get('Host','').split(':')[0] not in ('127.0.0.1','localhost'):
            return self.reply({'error':'Local access only.'},403)
        if path.startswith('/api/'):
            try:
                with connect() as db:self.api_get(path,db)
            except ValueError as e:self.reply({'error':str(e)},400)
            return
        with connect() as db:
            if path.startswith('/uploads/'):
                p=(DATA/'uploads'/Path(path).name)
                if not db.execute('SELECT 1 FROM uploads WHERE url=?',(path,)).fetchone() or not p.is_file():return self.send_error(404)
                return self.file_reply(p)
            # Existing media replacements also cover dynamically constructed intro URLs.
            replacement=db.execute('SELECT target FROM media WHERE source=?',(path,)).fetchone()
            if replacement:
                self.send_response(302);self.send_header('Location',replacement['target']);self.end_headers();return
            user=self.session(db)
            preview=parse_qs(urlparse(self.path).query).get('preview')==['1'] and user and user['role']=='admin'
            for page,(_,file,url) in PAGES.items():
                if page in copybook.COPY_PAGES:continue
                if path in (url,url+'index.html') or (url!='/' and path==url.rstrip('/')):
                    record=db.execute('SELECT * FROM content WHERE page=?',(page,)).fetchone()
                    values=json.loads(record['draft' if preview else 'published'])
                    markup=parse_content(page,values).rendered
                    markup=replace_media(markup,db)
                    return self.text_reply(inject_copy(markup,db,preview))
        p=(DIST/path.lstrip('/')).resolve()
        if not p.is_relative_to(DIST) or any(part.startswith('.') for part in Path(path).parts):return self.send_error(404)
        if p.is_dir() and not (p/'index.html').is_file():return self.send_error(404)
        html_file=p/'index.html' if p.is_dir() else p
        if html_file.suffix=='.html' and html_file.is_file():
            with connect() as db:return self.text_reply(inject_copy(replace_media(html_file.read_text(),db),db,preview,static=True))
        if p.is_file() and path.startswith('/assets/'):return self.file_reply(p)
        if p.suffix in ('.js','.css') and p.is_file():
            with connect() as db:return self.text_reply(replace_media(p.read_text(),db),'text/javascript' if p.suffix=='.js' else 'text/css')
        super().do_GET()
    def do_HEAD(self):self.do_GET()
    def copyfile(self,source,outputfile):
        if self.command!='HEAD':super().copyfile(source,outputfile)
    def api_get(self,path,db):
        user=self.session(db)
        copy=copybook.values(db,self.is_preview(db))
        if path=='/api/session':return self.reply({'user':public_user(user) if user else None,'needsSetup':not bool(db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone())})
        if not user:return self.reply({'error':'Please sign in to continue.'},401)
        if path=='/api/account':
            if user['role']=='admin' and self.is_preview(db):
                query=parse_qs(urlparse(self.path).query);role=query.get('role',['member'])[0]
                if role not in ('member','partner'):role='member'
                status=query.get('status',['pending'])[0]
                if status not in ('pending','active','declined','suspended'):status='pending'
                return self.reply({'preview':True,'user':{'id':'preview','name':copybook.text(copy,'ui.shared.preview.'+role),'email':'preview@example.invalid','role':role,'status':status,'company':'','phone':'','website':'','sector':'','created':now()},'requests':[]})
            requests=[dict(r) for r in db.execute('SELECT id,subject,message,status,reply,created,updated FROM requests WHERE user_id=? ORDER BY created DESC',(user['id'],))]
            return self.reply({'user':public_user(user),'requests':requests})
        if user['role']!='admin':return self.reply({'error':'Administrator access required.'},403)
        if path=='/api/admin/overview':
            counts={}
            for role in ('member','partner'):
                counts[role]=db.execute('SELECT COUNT(*) FROM users WHERE role=?',(role,)).fetchone()[0]
            counts['pending']=db.execute("SELECT COUNT(*) FROM users WHERE status='pending'").fetchone()[0]
            counts['requests']=db.execute("SELECT COUNT(*) FROM requests WHERE status!='closed'").fetchone()[0]
            return self.reply({'counts':counts,'recent':[public_user(r,True) for r in db.execute("SELECT * FROM users WHERE role!='admin' ORDER BY created DESC LIMIT 5")],'activity':[{**dict(r),'action':copybook.activity_text(copy,r['action'])} for r in db.execute('SELECT * FROM activity ORDER BY id DESC LIMIT 8')],'analytics':self.analytics(db)})
        if path=='/api/admin/people':return self.reply({'people':[public_user(r,True) for r in db.execute("SELECT * FROM users WHERE role!='admin' ORDER BY created DESC")]})
        if path=='/api/admin/requests':return self.reply({'requests':[dict(r) for r in db.execute('SELECT r.*,u.name,u.email,u.role FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.created DESC')]})
        if path=='/api/admin/analytics':return self.reply(self.analytics(db))
        if path=='/api/admin/media':return self.reply({'media':media_list(db)})
        if path=='/api/admin/content':
            pages=[]
            for key,(label,file,url) in PAGES.items():
                row=dict(db.execute('SELECT * FROM content WHERE page=?',(key,)).fetchone());draft=json.loads(row['draft']);published=json.loads(row['published'])
                parsed=parse_content(key,draft)
                pages.append({'id':key,'title':copybook.text(copy,'page.'+key,fallback=label),'url':url,'revision':row['revision'],'updated':row['updated'],'dirty':draft!=published,'fields':parsed.fields,'copyGroup':key in copybook.COPY_PAGES})
            return self.reply({'pages':pages})
        self.reply({'error':'Not found.'},404)
    def analytics(self,db):
        days=min(90,max(1,int(parse_qs(urlparse(self.path).query).get('days',['30'])[0])))
        since=datetime.fromtimestamp(time.time()-(days-1)*86400,timezone.utc).strftime('%Y-%m-%d')
        params=(since,)
        return {'days':days,'views':db.execute("SELECT COUNT(*) FROM events WHERE event='pageview' AND created>=?",params).fetchone()[0],
            'applications':db.execute("SELECT COUNT(*) FROM users WHERE role!='admin' AND created>=?",params).fetchone()[0],
            'daily':[dict(r) for r in db.execute("SELECT substr(created,1,10) day,COUNT(*) count FROM events WHERE event='pageview' AND created>=? GROUP BY day ORDER BY day",params)],
            'pages':[dict(r) for r in db.execute("SELECT path label,COUNT(*) count FROM events WHERE event='pageview' AND created>=? GROUP BY path ORDER BY count DESC",params)],
            'devices':[dict(r) for r in db.execute("SELECT device label,COUNT(*) count FROM events WHERE event='pageview' AND created>=? GROUP BY device ORDER BY count DESC",params)],
            'sources':[dict(r) for r in db.execute("SELECT referrer label,COUNT(*) count FROM events WHERE event='pageview' AND created>=? GROUP BY referrer ORDER BY count DESC",params)]}
    def do_POST(self):
        host=self.headers.get('Host','')
        origin=self.headers.get('Origin')
        if host.split(':')[0] not in ('127.0.0.1','localhost') or self.headers.get('X-BYJH')!='1' or (origin and origin!='http://'+host):return self.reply({'error':'Request origin not allowed.'},403)
        try:
            length=int(self.headers.get('Content-Length','0'))
            path=urlparse(self.path).path
            maxsize=70*1024*1024 if path=='/api/admin/upload' else 1024*1024
            if not 0<length<=maxsize: return self.reply({'error':'Request is too large or empty.'},413)
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict):raise ValueError('Invalid request.')
            with connect() as db:self.api_post(path,data,db)
        except (ValueError,KeyError,TypeError) as e:self.reply({'error':str(e) or 'Invalid request.'},400)
        except sqlite3.IntegrityError:self.reply({'error':'An account with that email already exists. Please sign in.'},409)
    def api_post(self,path,data,db):
        user=self.session(db)
        if self.is_preview_request():return self.reply({'error':'This is a draft preview. Open the live workspace to make changes.'},400)
        if path in ('/api/setup','/api/apply'):
            if not self.rate('signup',30):return
            db.execute('BEGIN IMMEDIATE')
            setup=path=='/api/setup'
            if setup and db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():return self.reply({'error':'Admin account is already configured.'},409)
            role='admin' if setup else data.get('role')
            if role not in ('admin','member','partner') or (not setup and role=='admin'):raise ValueError('Choose member or partner.')
            if not setup and data.get('consent') is not True:raise ValueError('Please confirm we can use your details to review this application.')
            name=clean(data,'name',120,True);mail=email(data);pw=validate_password(data.get('password'))
            values=[secrets.token_hex(12),mail,password_hash(pw),role,name,clean(data,'phone',60),clean(data,'company',160,role=='partner'),clean(data,'sector',120),clean(data,'website',300),clean(data,'message',4000),'active' if setup else 'pending','',now(),now()]
            db.execute('INSERT INTO users VALUES('+','.join('?' for _ in values)+')',values)
            newuser=db.execute('SELECT * FROM users WHERE id=?',(values[0],)).fetchone()
            audit(db,newuser,'workspaceCreated') if setup else audit(db,newuser,'applicationSubmitted',role=role)
            cookie=self.login_cookie(db,newuser);db.commit()
            return self.reply({'user':public_user(newuser)},201,cookie)
        if path=='/api/login':
            if not self.rate('login',40):return
            row=db.execute('SELECT * FROM users WHERE email=?',(email(data),)).fetchone()
            pw=submitted_password(data)
            valid=password_ok(pw,row['password']) if row else password_ok(pw,password_hash('dummy timing password'))
            if not row or not valid or data.get('role')!=row['role']:return self.reply({'error':'Email or password is incorrect for this portal.'},401)
            cookie=self.login_cookie(db,row);db.commit();return self.reply({'user':public_user(row)},cookie=cookie)
        if path=='/api/track':
            if user and user['role']=='admin':return self.reply({'ok':True})
            if not self.rate('track',600):return
            route=clean(data,'path',100)
            if route not in [p[2] for key,p in PAGES.items() if key not in copybook.COPY_PAGES]:raise ValueError('Invalid page')
            device=data.get('device','desktop')
            if device not in ('mobile','tablet','desktop'):raise ValueError('Invalid device')
            ref=urlparse(clean(data,'referrer',500)).hostname or 'Direct'
            if ref in ('127.0.0.1','localhost'):ref='Internal'
            db.execute('INSERT INTO events(path,event,device,referrer,created) VALUES(?,?,?,?,?)',(route,'pageview',device,ref,now()));db.commit();return self.reply({'ok':True})
        if not user:return self.reply({'error':'Please sign in to continue.'},401)
        if path=='/api/logout':
            cookie=SimpleCookie(self.headers.get('Cookie',''));token=cookie['byjh_session'].value
            db.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(token.encode()).hexdigest(),));db.commit();return self.reply({'ok':True},cookie='byjh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
        if path=='/api/account':
            data={**dict(user),**data}
            mail=email(data);name=clean(data,'name',120,True)
            db.execute('UPDATE users SET name=?,email=?,phone=?,company=?,sector=?,website=?,updated=? WHERE id=?',(name,mail,clean(data,'phone',60),clean(data,'company',160,user['role']=='partner'),clean(data,'sector',120),clean(data,'website',300),now(),user['id']))
            audit(db,user,'accountUpdated');db.commit();return self.reply({'ok':True})
        if path=='/api/password':
            if not self.rate('password',20):return
            if not password_ok(submitted_password(data,'current'),user['password']):return self.reply({'error':'Current password is incorrect.'},400)
            pw=validate_password(data.get('password'));db.execute('UPDATE users SET password=? WHERE id=?',(password_hash(pw),user['id']));db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],));cookie=self.login_cookie(db,user);db.commit();return self.reply({'ok':True},cookie=cookie)
        if path=='/api/requests':
            if user['role']=='admin' or user['status']!='active':return self.reply({'error':'Requests are available after your account is approved.'},403)
            db.execute('INSERT INTO requests(id,user_id,subject,message,created,updated) VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),user['id'],clean(data,'subject',200,True),clean(data,'message',5000,True),now(),now()))
            audit(db,user,'requestSent',role=user['role']);db.commit();return self.reply({'ok':True},201)
        if user['role']!='admin':return self.reply({'error':'Administrator access required.'},403)
        if path=='/api/admin/person':
            row=db.execute("SELECT * FROM users WHERE id=? AND role!='admin'",(data.get('id'),)).fetchone()
            if not row:return self.reply({'error':'Record not found.'},404)
            status=data.get('status')
            if status not in ('pending','active','declined','suspended'):raise ValueError('Invalid account status.')
            db.execute('UPDATE users SET name=?,email=?,phone=?,company=?,sector=?,website=?,status=?,notes=?,updated=? WHERE id=?',(clean(data,'name',120,True),email(data),clean(data,'phone',60),clean(data,'company',160,row['role']=='partner'),clean(data,'sector',120),clean(data,'website',300),status,clean(data,'notes',10000),now(),row['id']))
            audit(db,user,'personUpdated',name=row['name'],status=status);db.commit();return self.reply({'ok':True})
        if path=='/api/admin/request':
            if data.get('status') not in ('new','in-progress','closed'):raise ValueError('Invalid request status.')
            if not db.execute('SELECT 1 FROM requests WHERE id=?',(data.get('id'),)).fetchone():return self.reply({'error':'Request not found.'},404)
            db.execute('UPDATE requests SET status=?,reply=?,updated=? WHERE id=?',(data['status'],clean(data,'reply',5000),now(),data['id']));audit(db,user,'requestUpdated');db.commit();return self.reply({'ok':True})
        if path in ('/api/admin/content','/api/admin/publish','/api/admin/discard'):
            page=data.get('page')
            if page not in PAGES:raise ValueError('Invalid page.')
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT * FROM content WHERE page=?',(page,)).fetchone()
            if data.get('revision')!=row['revision']:return self.reply({'error':'This page changed in another session. Reload before saving.'},409)
            if path.endswith('/content'):
                fields=data.get('fields')
                if not isinstance(fields,dict):raise ValueError('Invalid content.')
                allowed={f['id']:f for f in parse_content(page).fields}
                for key,value in fields.items():
                    if key not in allowed or not isinstance(value,str) or len(value)>10000:raise ValueError('Invalid content field.')
                    if page in copybook.COPY_PAGES:copybook.validate(allowed[key]['original'],value)
                    if allowed[key]['type']=='number' and (not value.isdigit() or not 1<=int(value)<=100):raise ValueError('Seat count must be between 1 and 100.')
                parse_content(page,fields).rendered
                db.execute('UPDATE content SET draft=?,revision=revision+1,updated=? WHERE page=?',(json.dumps(fields),now(),page));action='draftSaved'
            elif path.endswith('/publish'):
                db.execute('UPDATE content SET published=draft,revision=revision+1,updated=? WHERE page=?',(now(),page));action='pagePublished'
            else:
                db.execute('UPDATE content SET draft=published,revision=revision+1,updated=? WHERE page=?',(now(),page));action='draftDiscarded'
            audit(db,user,action,page=page);db.commit();return self.reply({'ok':True,'revision':row['revision']+1})
        if path=='/api/admin/upload':
            name=Path(clean(data,'name',200,True)).name;extension=Path(name).suffix.lower()
            try:raw=base64.b64decode(data.get('data',''),validate=True)
            except Exception:raise ValueError('Invalid file.')
            if not 0<len(raw)<=50*1024*1024:raise ValueError('Files must be smaller than 50 MB.')
            valid={'.jpg':raw.startswith(b'\xff\xd8\xff'),'.jpeg':raw.startswith(b'\xff\xd8\xff'),'.png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'.gif':raw.startswith((b'GIF87a',b'GIF89a')),'.webp':raw[:4]==b'RIFF' and raw[8:12]==b'WEBP','.mp4':raw[4:8]==b'ftyp','.webm':raw.startswith(b'\x1aE\xdf\xa3')}
            if not valid.get(extension):raise ValueError('Upload a valid JPG, PNG, GIF, WebP, MP4 or WebM file.')
            filename=secrets.token_hex(16)+extension;url='/uploads/'+filename
            (DATA/'uploads'/filename).write_bytes(raw)
            db.execute('INSERT INTO uploads VALUES(?,?,?,?)',(url,name,len(raw),now()));audit(db,user,'uploaded',filename=name);db.commit();return self.reply({'url':url},201)
        if path=='/api/admin/media':
            db.execute('BEGIN IMMEDIATE')
            source=data.get('source');target=data.get('target');items={r['url']:r for r in media_list(db)}
            if source not in items or not source.startswith('/assets/') or target not in items:raise ValueError('Choose an existing site asset and a library file.')
            if items[source]['type']!=items[target]['type']:raise ValueError('Replace an image with an image, or a video with a video.')
            if source!=target and Path(source).suffix in ('.webm','.mp4') and Path(source).suffix!=Path(target).suffix:raise ValueError('Use the same video format to preserve playback support.')
            if target!=source and target in [r['source'] for r in db.execute('SELECT source FROM media')]:raise ValueError('Choose an original or uploaded file, not another replaced asset.')
            if target!=source and db.execute('SELECT 1 FROM media WHERE target=?',(source,)).fetchone():raise ValueError('This original is used by another replacement. Restore that replacement first, or upload a separate file.')
            if target==source:db.execute('DELETE FROM media WHERE source=?',(source,))
            else:db.execute('INSERT INTO media VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET target=excluded.target,updated=excluded.updated',(source,target,now()))
            audit(db,user,'mediaUpdated',filename=items[source]['name']);db.commit();return self.reply({'ok':True})
        self.reply({'error':'Not found.'},404)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8080);args=parser.parse_args()
    init()
    http=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'BYJH is running at http://127.0.0.1:{args.port}\nAdmin: http://127.0.0.1:{args.port}/admin/',flush=True)
    try:http.serve_forever()
    except KeyboardInterrupt:pass
    finally:http.server_close()
