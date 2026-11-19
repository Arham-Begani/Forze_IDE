import { diagnostic } from './excerpt.mjs';
import { openChat } from './chat.mjs';

const $ = id => document.getElementById(id);
const text = (id, value) => { $(id).textContent = value; };
const show = (id, visible = true) => { $(id).hidden = !visible; };
const fragment = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);
let roomId, room, chat, live = false, sending = false;
const messages = new Map();
let selection;
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {cache:'no-store'} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed. Try again.');
  return data;
}
const roomApi = (suffix = '', body) => api('/api/rooms/' + roomId + suffix, body);
function notice(e) { text('error',e.message || 'Action failed. Try again.'); show('error'); }
function action(id, fn) {
  $(id).addEventListener('click', async () => {
    const button = $(id); button.disabled = true; show('error',false);
    try { await fn(); } catch (e) { notice(e); } finally {button.disabled = false;}
  });
}
function roomTitle(s) { return s.name + ' / ' + s.deployment; }
const mapping = id => 'forze-room-for-' + id;

async function create(source, name, deployment, lines) {
  const result = await api('/api/rooms',{source,name,deployment,lines});
  if (source === 'ide') localStorage.setItem(mapping(deployment),result.id);
  location.assign('/r/' + result.id);
}
async function landing() {
  const sample = await api('/api/sample');
  text('logs',sample.logs.join('\n')); show('landing'); text('seat','Sample workspace');
  action('ask',async () => {
    show('selection'); $('choices').replaceChildren();
    selection = [];
    for (const line of sample.logs) {
      const clean = diagnostic(line);
      if (!clean) continue;
      const label = document.createElement('label'); label.className = 'choice';
      const input = document.createElement('input'); input.type='checkbox';
      const code = document.createElement('code'); code.textContent=clean;
      label.append(input,code); $('choices').append(label); selection.push({input,clean});
      input.addEventListener('change',preview);
    }
    text('previewTitle',roomTitle(sample)); preview(); $('selection').scrollIntoView({block:'nearest'});
  });
  function chosen(){ return selection.filter(s => s.input.checked).map(s => s.clean); }
  function preview(){const lines=chosen(); text('preview',lines.join('\n') || 'Select a line above.'); $('create').disabled=!lines.length;}
  action('create',() => create('sample',sample.name,sample.deployment,chosen()));
}
function renderRoom() {
  const owner = room.role === 'owner';
  text('seat',owner ? 'Developer view' : 'Teammate view');
  text('kind',room.source === 'sample' ? 'Sample deployment / Debug room' : 'Forze IDE / Debug room');
  text('title',roomTitle(room)); document.title=room.name+' · Forze Debug Rooms';
  text('excerpt',room.lines.join('\n')); show('loading',false); show('room'); show('sharing',owner);
  text('joined',room.joined ? 'Your teammate has joined.' : 'Open the invite in another browser or a private window.');
  show('invite',!room.joined && $('linkBox').hidden); if (room.joined) show('linkBox',false);
  text('solution',room.solution?.text || 'Waiting for the developer to accept a reply.');
  const run = room.rerun;
  text('status',run ? (room.source === 'sample' ? 'Sample build' : 'Observed in Forze')+' · '+run.state+' · '+run.id : 'No rerun recorded.');
  show('artifact',room.source === 'sample' && run?.state === 'READY');
  $('artifact').href='/api/rooms/'+roomId+'/artifact';
  show('sampleFix',owner && room.source==='sample'); show('ideNote',owner && room.source==='ide');
}
async function refresh() { room=await roomApi(); renderRoom(); }
function renderMessages() {
  const list=$('messages'), nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<70;
  list.replaceChildren();
  if (!messages.size) {
    const empty=document.createElement('p'); empty.className='muted';
    empty.textContent=live?'Start the conversation about this error.':'Conversation history appears when chat connects.';
    list.append(empty);
  }
  for (const m of [...messages.values()].sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id))) {
    const item=document.createElement('div'); item.className='message';
    const who=document.createElement('strong');
    who.textContent=m.mine?'You':(room.role==='owner'?'Teammate':'Developer');
    const when=document.createElement('time'); when.textContent=new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const body=document.createElement('p'); body.textContent=m.text; item.append(who,when,body);
    if (!m.mine && room.role==='owner' && room.solution?.messageId!==m.id) {
      const accept=document.createElement('button'); accept.className='secondary'; accept.textContent='Accept as solution';
      accept.onclick=async()=>{accept.disabled=true;try {await roomApi('/solution',{messageId:m.id,sender:m.sender,text:m.text});
        await refresh(); renderMessages();}catch(e){notice(e);accept.disabled=false;}};
      item.append(accept);
    }
    list.append(item);
  }
  if(nearEnd) list.scrollTop=list.scrollHeight;
}
function setLive(value) {
  live=value; text('connection',value?'Live':'Disconnected'); $('connection').classList.toggle('good',value);
  $('send').disabled=!value || sending; show('retry',!value); renderMessages();
}
async function connect() {
  try {
    const auth=await roomApi('/chat',{});
    let sdk;
    try { sdk=await import('/vendor/nexconn.js'); }
    catch {throw new Error('The server is missing its Nexconn SDK bundle. Run npm install and npm run build, then reconnect.');}
    chat=await openChat(sdk,auth,rows=>{for(const row of rows)messages.set(row.id,row);renderMessages();},setLive);
    setLive(true); show('older',chat.more); show('chatError',false);
  } catch(e){setLive(false);text('chatError',e.message);show('chatError');}
}
async function enter() {
  if(fragment.has('invite')) await roomApi('/join',{invite:fragment.get('invite')});
  await refresh();
  const draftKey='forze-draft-'+roomId;
  $('draft').value=sessionStorage.getItem(draftKey) || '';
  $('draft').oninput=()=>sessionStorage.setItem(draftKey,$('draft').value);
  action('invite',async()=>{
    const {invite}=await roomApi('/invite',{});
    $('inviteUrl').value=location.origin+'/r/'+roomId+'#invite='+invite;
    show('linkBox');show('invite',false);$('inviteUrl').select();
  });
  action('copy',async()=>{try{await navigator.clipboard.writeText($('inviteUrl').value);text('copy','Copied');}
    catch{$('inviteUrl').select();text('copy','Select and copy link');}});
  action('retry',async()=>location.reload());
  action('older',async()=>show('older',await chat.older()));
  $('composer').onsubmit=async e=>{
    e.preventDefault();
    const field=$('draft'), value=field.value.trim();
    if(!live||!value||sending)return;
    sending=true; $('send').disabled=true; show('chatError',false);
    try{await chat.send(value); if(field.value.trim()===value){field.value='';sessionStorage.removeItem(draftKey);}}
    catch(err){text('chatError',err.message || 'Reply failed. Try again.');show('chatError');}
    finally{sending=false;$('send').disabled=!live;}
  };
  $('sampleFix').onsubmit=async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;
    try{await roomApi('/sample-run',{module:$('module').value});await refresh();}catch(err){notice(err);}
    finally{button.disabled=false;}
  };
  let polling=false;
  setInterval(async()=>{if(polling||document.hidden)return;polling=true;try{
    const old=room.solution?.messageId; await refresh();if(old!==room.solution?.messageId)renderMessages();
  }catch(e){notice(e);}finally{polling=false;}},2500);
  await connect();
}
async function start(){
  if(fragment.has('draft')){
    const d=JSON.parse(fragment.get('draft'));
    const existing=localStorage.getItem(mapping(d.deployment));
    if(existing){location.replace('/r/'+existing);return;}
    await create('ide',d.name,d.deployment,d.lines);return;
  }
  if(fragment.has('report')){
    const report=JSON.parse(fragment.get('report'));roomId=localStorage.getItem(mapping(report.original));
    if(!roomId)throw new Error('Reopen the developer browser that created the room, then share the rerun again from Forze.');
    await roomApi('/status',report);location.replace('/r/'+roomId);return;
  }
  if(location.pathname.startsWith('/r/')){roomId=location.pathname.slice(3);await enter();} else await landing();
}
start().catch(e=>{text('reason',e.message);show('invalid');}).finally(()=>show('loading',false));
