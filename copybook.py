"""Named, plain-text application copy. Values never determine application behavior."""
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parent/'dist'
COPY_PAGES={
    'interface':('Forms & access','site-copy.json','/apply/'),
    'copy-shared':('Navigation & controls','copy/shared.json','/admin/'),
    'copy-admin':('Admin workspace','copy/admin.json','/admin/'),
    'copy-account':('Member & partner accounts','copy/account.json','/account/?role=member'),
    'copy-public':('Public interactions','copy/public.json','/contact/'),
    'copy-system':('System messages','copy/system.json','/admin/'),
}
SCHEMAS={key:json.loads((ROOT/file).read_text()) for key,(_,file,_) in COPY_PAGES.items()}
DEFAULTS={key:item['value'] for schema in SCHEMAS.values() for key,item in schema.items()}
ERROR_BY_TEXT={item['value']:key for key,item in SCHEMAS['copy-system'].items() if item.get('kind')=='error'}
TOKEN=re.compile(r'\{([A-Za-z_][\w]*)\}')

def values(db,preview=False):
    result=dict(DEFAULTS)
    rows=db.execute('SELECT page,draft,published FROM content').fetchall()
    for row in rows:
        if row['page'] in COPY_PAGES:
            saved=json.loads(row['draft' if preview else 'published'])
            result.update({k:v for k,v in saved.items() if k in SCHEMAS[row['page']] and isinstance(v,str)})
    return result

def text(copy,key,params=None,fallback=None):
    source=copy.get(key,DEFAULTS.get(key,fallback if fallback is not None else key))
    params=params or {}
    return TOKEN.sub(lambda m:str(params.get(m[1],m[0])),source)

def validate(default,value):
    expected=set(TOKEN.findall(default));found=set(TOKEN.findall(value))
    if expected!=found or re.search(r'[{}]',TOKEN.sub('',value)):
        raise ValueError('Keep the original placeholders in this wording.')

def error(message):
    if message in ERROR_BY_TEXT:return ERROR_BY_TEXT[message],{}
    for pattern,key in [(r'Invalid ([a-z]+)$','error.invalidField'),(r'Please provide a valid ([a-z]+)\.$','error.requiredField')]:
        match=re.fullmatch(pattern,message)
        if match:return key,{'field':match[1]}
    return ERROR_BY_TEXT.get('Invalid request.','error.generic'),{}

def error_text(copy,key,params):
    params=dict(params)
    if 'field' in params:params['field']=text(copy,'ui.shared.enum.field.'+params['field'],fallback=params['field'])
    return text(copy,key,params)

_FIXED={'Created the workspace':'workspaceCreated','Updated account details':'accountUpdated','Updated a concierge request':'requestUpdated'}
_PATTERNS=[(r'Submitted a (member|partner) application','applicationSubmitted',['role']),(r'Sent a (member|partner) request','requestSent',['role']),(r'Updated media · (.*)','mediaUpdated',['filename']),(r'Uploaded (.*)','uploaded',['filename']),(r'Updated (.*) · (pending|active|declined|suspended)','personUpdated',['name','status']),(r'Saved a draft for (.*)','draftSaved',['page']),(r'Published (.*)','pagePublished',['page']),(r'Discarded draft changes for (.*)','draftDiscarded',['page'])]
_PAGE_IDS={v:k[5:] for k,v in DEFAULTS.items() if k.startswith('page.')}

def activity_record(action):
    if action.startswith('{'):
        try:
            parsed=json.loads(action)
            if parsed.get('key') in DEFAULTS and isinstance(parsed.get('params'),dict):return parsed
        except (ValueError,TypeError,AttributeError):pass
    if action in _FIXED:return {'key':'activity.'+_FIXED[action],'params':{}}
    for pattern,key,names in _PATTERNS:
        match=re.fullmatch(pattern,action,re.DOTALL)
        if match:
            params=dict(zip(names,match.groups()))
            if 'page' in params:params['page']=_PAGE_IDS.get(params['page'],params['page'])
            return {'key':'activity.'+key,'params':params}
    return None

def activity_text(copy,action):
    record=activity_record(action)
    if not record:return action
    params=dict(record['params'])
    for name in ('role','status'):
        if name in params:params[name]=text(copy,'ui.shared.enum.'+name+'.'+params[name],fallback=params[name])
    if 'page' in params:params['page']=text(copy,'page.'+params['page'],fallback=params['page'])
    return text(copy,record['key'],params)
