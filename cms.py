"""Edit public copy without executing HTML and retain legacy persisted field IDs."""
import html
import json
import re
from html.parser import HTMLParser

VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
COPY_ATTRIBUTES={'title','data-title','data-caption','data-panel-label','data-chapter'}
DYNAMIC_CLASSES={'members-total','partners-total','chapter-number','chapter-percent','chapter-label','passing-name'}
ATTRIBUTE_TOKEN=re.compile(r'''(\s+)([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?''')

class ContentPage(HTMLParser):
    def __init__(self,source,values=None):
        super().__init__(convert_charrefs=False)
        self.values=values or {}
        self.fields=[];self.output=[];self.stack=[];self.pending=[]
        self.counter=0;self.element=0;self.section='Page'
        self.feed(source);self.close();self.flush_text()

    def field(self,value,kind='text',label=None,key=None,expose=True):
        if key is None:
            key=f'f{self.counter}';self.counter+=1
        if expose:self.fields.append({'id':key,'type':kind,'label':label or self.section,'original':value,'value':self.values.get(key,value)})
        return self.values.get(key,value)

    def flush_text(self):
        if not self.pending:return
        parts=self.pending;self.pending=[]
        tag,attrs=self.stack[-1] if self.stack else ('',{})
        expose=not (set(attrs.get('class','').split())&DYNAMIC_CLASSES or attrs.get('id') in ('horizontal-chapter','horizontal-count','media-counter'))
        if not any(kind=='entity' for kind,_ in parts):
            for _,data in parts:
                stripped=data.strip()
                if not stripped:self.output.append(data);continue
                new=self.field(stripped,label=self.section+' / '+tag,expose=expose)
                self.output.append(data if new==stripped else data.replace(stripped,html.escape(str(new))))
            return
        # Consume exactly the IDs that the original parser assigned to data chunks.
        # A separate group key replaces the full phrase, while old saved fragments
        # still render correctly until that phrase is next saved in the editor.
        original=''.join(raw for _,raw in parts);migrated=[];legacy=[]
        for kind,data in parts:
            stripped=data.strip()
            if kind=='data' and stripped:
                key=f'f{self.counter}';self.counter+=1;legacy.append(key)
                value=self.values.get(key,stripped)
                migrated.append(data if value==stripped else data.replace(stripped,html.escape(str(value))))
            else:migrated.append(data)
        key='text:'+','.join(legacy) if legacy else f'entity:{self.element}'
        default=html.unescape(original).strip();current=html.unescape(''.join(migrated)).strip()
        value=self.values.get(key,current)
        if expose:self.fields.append({'id':key,'type':'text','label':self.section+' / '+tag,'original':default,'value':value,'legacyIds':legacy})
        if key not in self.values:self.output.extend(migrated)
        else:
            leading=original[:len(original)-len(original.lstrip())];trailing=original[len(original.rstrip()):]
            self.output.append(leading+html.escape(str(value))+trailing)

    def handle_decl(self,decl):self.flush_text();self.output.append('<!'+decl+'>')
    def handle_comment(self,data):self.flush_text();self.output.append('<!--'+data+'-->')
    def handle_entityref(self,name):self.pending.append(('entity','&'+name+';'))
    def handle_charref(self,name):self.pending.append(('entity','&#'+name+';'))

    def handle_starttag(self,tag,attrs):
        self.flush_text();self.element+=1
        raw=self.get_starttag_text();ad=dict(attrs);changes={}
        if tag in ('section','article'):self.section=(ad.get('id') or ad.get('class') or tag).replace('-',' ').title()
        for attr,val in attrs:
            if val and (attr in ('alt','placeholder','aria-label') or (tag=='meta' and attr=='content' and ad.get('name')=='description')):
                new=self.field(val,label=self.section+' / '+attr)
                if new!=val:changes[attr]=str(new)
            elif val and attr in COPY_ATTRIBUTES:
                new=self.field(val,label=self.section+' / '+attr,key=f'attr:{self.element}:{attr}')
                if new!=val:changes[attr]=str(new)
        if changes:
            def replace(match):
                attr=match[2].lower()
                return match[1]+match[2]+'="'+html.escape(changes[attr],quote=True)+'"' if attr in changes else match[0]
            raw=ATTRIBUTE_TOKEN.sub(replace,raw)
        self.output.append(raw)
        if tag not in VOID:self.stack.append((tag,ad))

    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID and self.stack:self.stack.pop()

    def handle_endtag(self,tag):
        self.flush_text();self.output.append('</'+tag+'>')
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:self.stack=self.stack[:i];break

    def handle_data(self,data):
        tag,attrs=self.stack[-1] if self.stack else ('',{})
        if tag=='script' and attrs.get('id')=='fleet-data':
            def walk(value,path):
                if isinstance(value,dict):
                    result={}
                    for k,v in value.items():
                        label=k
                        if path and path[-1]=='specifications':
                            label=self.field(k,label='Fleet / '+' / '.join(path+[k])+' heading',key='category:'+':'.join(path+[k]))
                            if not label.strip() or label in result:raise ValueError('Fleet category headings must be non-empty and unique within each vehicle.')
                        result[label]=walk(v,path+[k])
                    return result
                if isinstance(value,list):return [walk(v,path+[str(i+1)]) for i,v in enumerate(value)]
                if isinstance(value,str) and not value.startswith('/assets/'):return self.field(value,label='Fleet / '+' / '.join(path))
                if isinstance(value,int):return int(self.field(str(value),'number','Fleet / '+' / '.join(path)))
                return value
            self.output.append(json.dumps(walk(json.loads(data),[])).replace('<','\\u003c'))
        elif any(t in ('script','style','svg') for t,_ in self.stack):self.output.append(data)
        else:self.pending.append(('data',data))

    @property
    def rendered(self):return ''.join(self.output)


class InterfaceCopy:
    """Stable named keys for shared copy rendered by JavaScript."""
    def __init__(self, source, values=None):
        schema=json.loads(source);values=values or {}
        self.fields=[{'id':key,'type':'text','label':item['label'],'original':item['value'],'value':values.get(key,item['value']),'parameters':sorted(set(re.findall(r'\{([A-Za-z_][\w]*)\}',item['value'])))} for key,item in schema.items()]
        self.copy={f['id']:f['value'] for f in self.fields}
        self.rendered=json.dumps(self.copy).replace('<','\\u003c')
