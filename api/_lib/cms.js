// JavaScript port of cms.py (ContentPage / InterfaceCopy) for the Vercel functions.
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const COPY_ATTRIBUTES=new Set(['title','data-title','data-caption','data-panel-label','data-chapter']);
const DYNAMIC_CLASSES=new Set(['member-no','members-total','partners-total','chapter-number','chapter-percent','chapter-label','passing-name']);
const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',mdash:'—',ndash:'–',hellip:'…',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',copy:'©',middot:'·',reg:'®',times:'×',bull:'•',eacute:'é'};
// Repeating blocks the admin can add to and delete from.
const GROUPS={
  home:[{id:'features',code:'f',label:'Highlights',noun:'highlight',re:/<div class="feature-row">[\s\S]*?<\/p><\/div><\/div>/g}],
  members:[{id:'members',code:'m',label:'Members',noun:'member',re:/<article class="member(?! member-open)[^"]*">[\s\S]*?<\/article>/g}],
  partners:[{id:'partners',code:'p',label:'Partners',noun:'partner',re:/<li class="partner"[^>]*>[\s\S]*?<\/li>/g}],
  gallery:[{id:'gallery',code:'g',label:'Gallery',noun:'photo or film',re:/<a class="gallery-item[^"]*"[^>]*>[\s\S]*?<\/a>/g,renumber:true}],
};
const ITEM_ID=/^([a-z]\d{1,4}|n[a-z0-9]{6,20})$/;
const skipImage=(src,attrs)=>!src||/\/assets\/byjh\/(logo|favicon)/.test(src)||/(^|\s)heading-logo(\s|$)/.test(attrs.class||'');
const cap=t=>t.replace(/(^|\s)\S/g,c=>c.toUpperCase());
const unescapeHtml=s=>s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?/g,(m,n)=>{
  if(n[0]==='#'){const c=n[1]==='x'||n[1]==='X'?parseInt(n.slice(2),16):parseInt(n.slice(1),10);return c>0&&c<=0x10ffff?String.fromCodePoint(c):m;}
  return n in NAMED?NAMED[n]:m;});
const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
const replaceAll=(text,find,value)=>text.split(find).join(value);

function tokenize(source){
  const tokens=[];let i=0,cdata=null;
  const n=source.length;
  while(i<n){
    if(cdata){
      const end=source.toLowerCase().indexOf('</'+cdata,i);
      const stop=end<0?n:end;
      if(stop>i)tokens.push({t:'data',v:source.slice(i,stop)});
      i=stop;cdata=null;continue;
    }
    if(source[i]==='<'){
      let m;
      if(source.startsWith('<!--',i)){const e=source.indexOf('-->',i+4);const stop=e<0?n:e;tokens.push({t:'comment',v:source.slice(i+4,stop)});i=e<0?n:e+3;continue;}
      if(source[i+1]==='!'){const e=source.indexOf('>',i);tokens.push({t:'decl',v:source.slice(i+2,e<0?n:e)});i=e<0?n:e+1;continue;}
      if((m=/^<\/([a-zA-Z][^\t\n\r\f />]*)[^>]*>/.exec(source.slice(i,i+400)))){tokens.push({t:'end',tag:m[1].toLowerCase()});i+=m[0].length;continue;}
      if((m=/^<([a-zA-Z][^\t\n\r\f />]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(source.slice(i,i+20000)))){
        const tag=m[1].toLowerCase(),raw=m[0],attrs=[];
        const re=/([^\s\/>][^\s\/=>]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g;let a;
        const body=m[2].replace(/\/\s*$/,'');
        while((a=re.exec(body))){
          let v=a[2];
          if(v!==undefined&&(v[0]==='"'||v[0]==="'")&&v.length>=2&&v[v.length-1]===v[0])v=v.slice(1,-1);
          attrs.push([a[1].toLowerCase(),v===undefined?null:unescapeHtml(v)]);
        }
        tokens.push({t:/\/\s*>$/.test(raw)?'startend':'start',tag,attrs,raw});
        i+=raw.length;
        if((tag==='script'||tag==='style')&&!/\/\s*>$/.test(raw))cdata=tag;
        continue;
      }
      tokens.push({t:'data',v:'<'});i++;continue;
    }
    if(source[i]==='&'){
      const m=/^&(#(?:[0-9]+|[xX][0-9a-fA-F]+)|[a-zA-Z][-.a-zA-Z0-9]*)([^a-zA-Z0-9])?/.exec(source.slice(i,i+80));
      if(m&&(m[2]!==undefined)){
        const name=m[1],consumed=m[2]===';'?m[0].length:m[0].length-1;
        tokens.push({t:'entity',v:'&'+name+';'});i+=consumed;continue;
      }
      tokens.push({t:'data',v:'&'});i++;continue;
    }
    let j=i;while(j<n&&source[j]!=='<'&&source[j]!=='&')j++;
    tokens.push({t:'data',v:source.slice(i,j)});i=j;
  }
  return tokens;
}

class ContentPage{
  constructor(source,values,opts={}){
    this.values=values||{};this.fields=[];this.output=[];this.stack=[];this.pending=[];this.groups=[];
    this.prefix=opts.prefix||'';this.opts=opts;this.imageChanges=[];
    this.counter=opts.counter||0;this.element=opts.element||0;this.section=opts.section||'Page';
    if(opts.groups&&opts.groups.length&&!opts.prefix)return this.groupedParse(source,opts.groups);
    this.run(source);
  }
  run(source){
    for(const tok of tokenize(source)){
      if(tok.t==='decl'){this.flush();this.output.push('<!'+tok.v+'>');}
      else if(tok.t==='comment'){this.flush();this.output.push('<!--'+tok.v+'-->');}
      else if(tok.t==='entity')this.pending.push(['entity',tok.v]);
      else if(tok.t==='start')this.startTag(tok);
      else if(tok.t==='startend'){this.startTag(tok);if(!VOID.has(tok.tag)&&this.stack.length)this.stack.pop();}
      else if(tok.t==='end')this.endTag(tok.tag);
      else this.data(tok.v);
    }
    this.flush();
  }
  groupedParse(source,groups){
    const group=groups[0],rest=groups.slice(1);
    const masked=source.replace(/<!--[\s\S]*?-->/g,m=>' '.repeat(m.length));
    const found=[...masked.matchAll(group.re)].map(m=>({start:m.index,end:m.index+m[0].length}));
    if(!found.length){if(rest.length)this.groupedParse(source,rest);else this.run(source);return;}
    const pre=new ContentPage(source.slice(0,found[0].start),this.values,{section:this.section,groups:rest,counter:this.counter,element:this.element});
    const templates=found.map(f=>source.slice(f.start,f.end));
    const gaps=found.map((f,i)=>source.slice(f.end,i+1<found.length?found[i+1].start:f.end));
    const saved=this.values.__items&&this.values.__items[group.id];
    const order=Array.isArray(saved)?saved:found.map((_,i)=>group.code+i);
    this.fields.push(...pre.fields);this.output.push(...pre.output);this.groups.push(...pre.groups);
    const ids=[];
    order.forEach((id,pos)=>{
      const index=id[0]===group.code&&/^\d+$/.test(id.slice(1))?+id.slice(1):-1;
      const tpl=templates[index>=0&&index<templates.length?index:0];
      const sub=new ContentPage(tpl,this.values,{prefix:id+'.',section:group.label,group});
      let out=sub.rendered;
      for(const [from,to] of sub.imageChanges)out=replaceAll(out,from,to);
      if(group.renumber)out=out.replace(/(<span>)\d+(<\/span><\/div><\/a>\s*)$/,(m,x,y)=>x+String(pos+1).padStart(2,'0')+y);
      for(const f of sub.fields)this.fields.push({...f,item:id,group:group.id});
      this.output.push(out,gaps[Math.min(index>=0?index:0,gaps.length-1)]||'');
      ids.push(id);
    });
    this.groups.push({id:group.id,code:group.code,label:group.label,noun:group.noun,items:ids,count:found.length});
    const post=new ContentPage(source.slice(found[found.length-1].end),this.values,{counter:pre.counter,element:pre.element,section:pre.section,groups:rest});
    this.fields.push(...post.fields);this.output.push(...post.output);this.groups.push(...post.groups);
    this.counter=post.counter;this.element=post.element;this.section=post.section;
  }
  field(value,kind='text',label=null,key=null,expose=true){
    if(key===null){key='f'+this.counter;this.counter++;}
    key=this.prefix+key;
    const has=Object.prototype.hasOwnProperty.call(this.values,key);
    if(expose)this.fields.push({id:key,type:kind,label:label||this.section,original:value,value:has?this.values[key]:value});
    return has?this.values[key]:value;
  }
  flush(){
    if(!this.pending.length)return;
    const parts=this.pending;this.pending=[];
    const [tag,attrs]=this.stack.length?this.stack[this.stack.length-1]:['',{}];
    const classes=(attrs.class||'').split(/\s+/).filter(Boolean);
    const expose=!(classes.some(c=>DYNAMIC_CLASSES.has(c))||['horizontal-chapter','horizontal-count','media-counter'].includes(attrs.id)||(this.opts.group&&this.opts.group.renumber&&parts.every(p=>/^\s*\d*\s*$/.test(p[1]))));
    if(!parts.some(([kind])=>kind==='entity')){
      for(const [,data] of parts){
        const stripped=data.trim();
        if(!stripped){this.output.push(data);continue;}
        const value=this.field(stripped,'text',this.section+' / '+tag,null,expose);if(expose)Object.assign(this.fields[this.fields.length-1],{tag,cls:attrs.class||''});
        this.output.push(value===stripped?data:replaceAll(data,stripped,escapeHtml(value)));
      }
      return;
    }
    const original=parts.map(p=>p[1]).join('');const migrated=[],legacy=[];
    for(const [kind,data] of parts){
      const stripped=data.trim();
      if(kind==='data'&&stripped){
        const key=this.prefix+'f'+this.counter;this.counter++;legacy.push(key);
        const value=Object.prototype.hasOwnProperty.call(this.values,key)?this.values[key]:stripped;
        migrated.push(value===stripped?data:replaceAll(data,stripped,escapeHtml(value)));
      }else migrated.push(data);
    }
    const key=legacy.length?'text:'+legacy.join(','):this.prefix+'entity:'+this.element;
    const def=unescapeHtml(original).trim(),current=unescapeHtml(migrated.join('')).trim();
    const has=Object.prototype.hasOwnProperty.call(this.values,key);
    const value=has?this.values[key]:current;
    if(expose)this.fields.push({id:key,type:'text',label:this.section+' / '+tag,original:def,value,legacyIds:legacy,tag,cls:attrs.class||''});
    if(!has)this.output.push(...migrated);
    else{
      const leading=original.slice(0,original.length-original.trimStart().length);
      const trailing=original.slice(original.trimEnd().length);
      this.output.push(leading+escapeHtml(value)+trailing);
    }
  }
  startTag(tok){
    this.flush();this.element++;
    const {tag,attrs}=tok;let raw=tok.raw;
    const ad={};for(const [k,v] of attrs)if(!(k in ad))ad[k]=v;
    const changes={};
    if(tag==='section'||tag==='article')this.section=(ad.id||ad.class||tag).replace(/-/g,' ').replace(/\w\S*/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
    for(const [attr,val] of attrs){
      if(val&&(['alt','placeholder','aria-label'].includes(attr)||(tag==='meta'&&attr==='content'&&ad.name==='description'))){
        const value=this.field(val,'text',this.section+' / '+attr);
        if(value!==val)changes[attr]=String(value);
      }else if(val&&COPY_ATTRIBUTES.has(attr)){
        const value=this.field(val,'text',this.section+' / '+attr,`attr:${this.element}:${attr}`);
        if(value!==val)changes[attr]=String(value);
      }
    }
    if(tag==='source'&&/\.(mp4|webm)(\?|$)/i.test(ad.src||'')){
      const value=this.field(ad.src,'video',this.section+' / video',`video:${this.element}`);
      if(value!==ad.src)changes.src=String(value);
    }
    if(tag==='a'&&ad['data-media']==='video'&&ad.href){
      const value=this.field(ad.href,'video',this.section+' / video',`video:${this.element}`);
      if(value!==ad.href)changes.href=String(value);
    }
    if(tag==='video'&&ad.poster){
      const value=this.field(ad.poster,'image',this.section+' / cover picture',`poster:${this.element}`);
      if(value!==ad.poster)changes.poster=String(value);
    }
    if(tag==='img'&&!skipImage(ad.src,ad)){
      const value=this.field(ad.src,'image',this.section+' / image',`img:${this.element}`);
      if(value!==ad.src){changes.src=String(value);this.imageChanges.push([ad.src,String(value)]);}
    }
    if(Object.keys(changes).length){
      raw=raw.replace(/(\s+)([^\s=\/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g,(match,space,name)=>{
        const a=name.toLowerCase();
        return a in changes?space+name+'="'+escapeHtml(changes[a])+'"':match;
      });
    }
    this.output.push(raw);
    if(!VOID.has(tag))this.stack.push([tag,ad]);
  }
  endTag(tag){
    this.flush();this.output.push('</'+tag+'>');
    for(let i=this.stack.length-1;i>=0;i--)if(this.stack[i][0]===tag){this.stack=this.stack.slice(0,i);break;}
  }
  data(text){
    const [tag,attrs]=this.stack.length?this.stack[this.stack.length-1]:['',{}];
    if(tag==='script'&&attrs.id==='fleet-data'){
      const walk=(value,path)=>{
        if(Array.isArray(value)&&path.length>=3&&path[path.length-2]==='specifications'&&value.every(v=>typeof v==='string')){
          const groupKey='spec:'+path[0]+':'+path[path.length-1];
          const saved=this.values.__items&&this.values.__items[groupKey];
          const order=Array.isArray(saved)?saved:value.map((_,i)=>'s'+i);
          const ids=[],out=[];
          for(const id of order){
            const index=id[0]==='s'&&/^\d+$/.test(id.slice(1))?+id.slice(1):-1;
            const orig=value[index>=0&&index<value.length?index:value.length-1];
            const before=this.fields.length;
            out.push(this.field(orig,'text','Fleet / '+path.join(' / '),id+'.'+groupKey.replace(/[.]/g,'_')));
            ids.push(id);
            if(this.fields.length>before)Object.assign(this.fields[this.fields.length-1],{item:id,group:groupKey});
          }
          this.groups.push({id:groupKey,code:'s',label:cap(path[0])+' · '+path[path.length-1],noun:'detail',items:ids,count:value.length,compact:true});
          return out;
        }
        if(Array.isArray(value))return value.map((v,i)=>walk(v,[...path,String(i+1)]));
        if(value&&typeof value==='object'){
          const result={};
          for(const [k,v] of Object.entries(value)){
            let label=k;
            if(path.length&&path[path.length-1]==='specifications'){
              label=this.field(k,'text','Fleet / '+[...path,k].join(' / ')+' heading','category:'+[...path,k].join(':'));
              if(!label.trim()||label in result)throw new Error('Fleet category headings must be non-empty and unique within each vehicle.');
            }
            result[label]=walk(v,[...path,k]);
          }
          return result;
        }
        if(typeof value==='string'&&value.startsWith('/assets/'))return this.field(value,'image','Fleet / '+path.join(' / '));
        if(typeof value==='string')return this.field(value,'text','Fleet / '+path.join(' / '));
        if(Number.isInteger(value))return parseInt(this.field(String(value),'number','Fleet / '+path.join(' / ')),10);
        return value;
      };
      this.output.push(JSON.stringify(walk(JSON.parse(text),[])).replace(/</g,'\\u003c'));
    }else if(this.stack.some(([t])=>t==='script'||t==='style'||t==='svg'))this.output.push(text);
    else this.pending.push(['data',text]);
  }
  get rendered(){return this.output.join('');}
}

class InterfaceCopy{
  constructor(source,values){
    const schema=JSON.parse(source);values=values||{};
    this.fields=Object.entries(schema).map(([key,item])=>({id:key,type:'text',label:item.label,original:item.value,value:key in values?values[key]:item.value,parameters:[...new Set([...item.value.matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m=>m[1]))].sort()}));
    this.copy=Object.fromEntries(this.fields.map(f=>[f.id,f.value]));
    this.rendered=JSON.stringify(this.copy).replace(/</g,'\\u003c');
  }
}

module.exports={ContentPage,InterfaceCopy,escapeHtml,GROUPS,ITEM_ID};
