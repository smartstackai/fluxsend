  const state = {
  role: null, ws: null, peerConnection: null, dataChannel: null, roomCode: null,
  files: [], manifest: null, senderState: { chunksAcked:0, totalChunks:0, startTime:null, currentFile:0 },
  transferState: { bytesReceived:0, totalBytes:0, startTime:null, fileBuffers:[], filesCompleted:0 },
  chatOpen: false, chatUnread: 0, iceServers: [],
};

// ==================== VIEWS ====================
function showView(id) { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function showSenderView() { state.role='sender'; showView('view-sender'); }
function showReceiverView() { state.role='receiver'; showView('view-receiver'); }
function switchSendMode(mode) {
  document.querySelectorAll('#sender-step-2 .tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#sender-step-2 .tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#sender-step-2 .tab')[mode==='qr'?0:1].classList.add('active');
  document.getElementById(mode==='qr'?'send-qr-panel':'send-code-panel').classList.add('active');
}

// ==================== UTILITY ====================
function formatSize(b){if(!b)return'0 B';const u=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(1024));return(b/Math.pow(1024,i)).toFixed(i>0?1:0)+' '+u[i];}
function formatSpeed(bps){return formatSize(bps)+'/s';}
function formatETA(s){if(!isFinite(s)||s<0)return'...';if(s<60)return Math.ceil(s)+'s';return Math.floor(s/60)+'m '+Math.ceil(s%60)+'s';}
function getFileExt(n){const p=n.split('.');return p.length>1?p.pop().toUpperCase():'FILE';}
function showToast(m,t='info'){const el=document.getElementById('toast');el.textContent=m;el.className='toast '+t;setTimeout(()=>el.className='toast hidden',3000);}
function getFileIcon(name){const ext=name.split('.').pop().toLowerCase();const icons={jpg:'IMG',jpeg:'IMG',png:'IMG',gif:'IMG',webp:'IMG',heic:'IMG',heif:'IMG',bmp:'IMG',svg:'IMG',mp4:'VID',avi:'VID',mkv:'VID',mov:'VID',wmv:'VID',webm:'VID',m4v:'VID','3gp':'VID',mp3:'AUD',wav:'AUD',flac:'AUD',aac:'AUD',ogg:'AUD',m4a:'AUD',pdf:'PDF',doc:'DOC',docx:'DOC',txt:'TXT',csv:'CSV',zip:'ZIP',rar:'ZIP','7z':'ZIP',exe:'APP',psd:'PSD'};return icons[ext]||getFileExt(name);}

// ==================== HISTORY ====================
function getHistory(){try{return JSON.parse(localStorage.getItem('p2p_history')||'[]');}catch(e){return[];}}
function addHistory(entry){const h=getHistory();h.unshift(entry);if(h.length>50)h.length=50;localStorage.setItem('p2p_history',JSON.stringify(h));}
function clearHistory(){localStorage.removeItem('p2p_history');renderHistory();}
function showHistory(){showView('view-history');renderHistory();}
function renderHistory(){
  const h=getHistory();
  const el=document.getElementById('history-list');
  if(!h.length){el.innerHTML='<div class="history-empty">No transfers yet</div>';return;}
  el.innerHTML=h.map(e=>`<div class="history-item"><div class="h-icon ${e.type}">${e.type==='sent'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 6 12 2 16 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>'}</div><div class="h-info"><div class="h-name">${e.files.map(f=>f.name).join(', ')}</div><div class="h-meta">${e.files.length} file${e.files.length>1?'s':''} &middot; ${new Date(e.time).toLocaleString()}</div></div><div class="h-size">${formatSize(e.totalSize)}</div></div>`).join('');
}

// ==================== FILE SELECTION ====================
const dropZone=document.getElementById('drop-zone');
const fileInput=document.getElementById('file-input');
dropZone.addEventListener('click',()=>fileInput.click());
dropZone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';dropZone.classList.add('dragover');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop',e=>{
  e.preventDefault();dropZone.classList.remove('dragover');
  const items=e.dataTransfer.items;
  if(items){const entries=[];for(let i=0;i<items.length;i++){const en=items[i].webkitGetAsEntry?items[i].webkitGetAsEntry():null;if(en)entries.push(en);}if(entries.length){processEntries(entries);return;}}
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change',()=>{addFiles(fileInput.files);fileInput.value='';});

function processEntries(entries){Promise.all(entries.map(e=>readEntry(e))).then(r=>{const all=r.flat();if(all.length)addFiles(all);});}
function readEntry(entry){return new Promise(resolve=>{if(entry.isFile){entry.file(f=>resolve([f]),()=>resolve([]));}else if(entry.isDirectory){const reader=entry.createReader();const all=[];function read(){reader.readEntries(b=>{if(!b.length){Promise.all(all.map(e=>readEntry(e))).then(r=>resolve(r.flat()));}else{all.push(...b);read();}},()=>resolve([]));}read();}else resolve([]);});}

function addFiles(list){
  let added=0;
  for(const f of list){if(!state.files.find(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)){state.files.push(f);added++;}}
  renderFileList();
  if(added)showToast(added+' file'+(added>1?'s':'')+' added','success');
}
function removeFile(i){state.files.splice(i,1);renderFileList();}
function clearFiles(){state.files=[];renderFileList();}
function renderFileList(){
  const c=document.getElementById('file-list');
  const btn=document.getElementById('send-btn');
  if(!state.files.length){c.innerHTML='';btn.disabled=true;return;}
  btn.disabled=false;
  const total=state.files.reduce((a,f)=>a+f.size,0);
  c.innerHTML=state.files.map((f,i)=>`<div class="file-item"><div class="file-icon ${f.type.startsWith('image/')?'icon-img':f.type.startsWith('video/')?'icon-vid':f.type.startsWith('audio/')?'icon-aud':''}">${getFileIcon(f.name)}</div><div class="file-info"><div class="file-name">${f.name}</div><div class="file-size">${formatSize(f.size)}</div></div><button class="file-remove" onclick="removeFile(${i})">&times;</button></div>`).join('')+`<div class="file-item" style="justify-content:space-between;color:var(--text-dim);font-size:12px"><span>${state.files.length} file${state.files.length>1?'s':''} &middot; ${formatSize(total)}</span><button class="file-remove" onclick="clearFiles()" style="font-size:11px;color:var(--error)">Clear all</button></div>`;
}

// ==================== PASSWORD ====================
function togglePasswordOption(){document.getElementById('room-password').classList.toggle('hidden',!document.getElementById('password-toggle').checked);}

// ==================== WEBSOCKET ====================
function connectSignaling(){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws');
    state.ws=ws;
    const t=setTimeout(()=>{reject(new Error('Server is waking up, please try again'));ws.close();},30000);
    ws.onopen=()=>{clearTimeout(t);resolve(ws);};
    ws.onerror=()=>{clearTimeout(t);reject(new Error('Cannot reach server'));};
    ws.onclose=()=>{clearTimeout(t);};
    ws.onmessage=e=>{try{handleSignalingMessage(JSON.parse(e.data));}catch(err){}};
  });
}

function handleSignalingMessage(msg){
  switch(msg.type){
    case'connected':state.iceServers=(msg.iceServers||[]);break;
    case'room-created':state.roomCode=msg.code;onRoomCreated(msg);break;
    case'room-joined':state.roomCode=msg.code;onRoomJoined(msg.code);break;
    case'peer-joined':onPeerJoined();break;
    case'offer':onOffer(msg);break;
    case'answer':onAnswer(msg);break;
    case'ice-candidate':onIceCandidate(msg);break;
    case'chat':onChatMessage(msg);break;
    case'transfer-complete':onTransferComplete(msg);break;
    case'peer-disconnected':onPeerDisconnected();break;
    case'error':handleError(msg.code);break;
  }
}

// ==================== SENDER ====================
async function createRoom(){
  if(!state.files.length)return;
  const pw=document.getElementById('password-toggle').checked?document.getElementById('room-password').value.trim():'';
  try{
    await connectSignaling();
    state.ws.send(JSON.stringify({type:'create-room',metadata:{fileCount:state.files.length,totalSize:state.files.reduce((a,f)=>a+f.size,0),password:pw||undefined}}));
  }catch(e){showToast('Failed: '+e.message,'error');}
}

async function onRoomCreated(msg){
  document.getElementById('sender-step-1').classList.add('hidden');
  document.getElementById('sender-step-2').classList.remove('hidden');
  document.getElementById('room-code-display').textContent=msg.code;
  document.getElementById('chat-toggle').classList.remove('hidden');
  try{const r=await fetch('/api/qr/'+msg.code);const d=await r.json();document.getElementById('qr-image').src=d.qrDataUrl;document.getElementById('local-url').textContent=d.url;}catch(e){}
}

async function onPeerJoined(){
  document.getElementById('sender-step-2').classList.add('hidden');
  document.getElementById('sender-step-3').classList.remove('hidden');
  try{await setupSenderPeerConnection();}catch(e){showToast('WebRTC failed: '+e.message,'error');}
}

async function setupSenderPeerConnection(){
  const pc=new RTCPeerConnection({iceServers:state.iceServers});
  state.peerConnection=pc;
  pc.onicecandidate=e=>{if(e.candidate)state.ws.send(JSON.stringify({type:'ice-candidate',candidate:e.candidate}));};
  pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed')updateSenderStatus('Connection failed','error');};
  const ch=pc.createDataChannel('file-transfer',{ordered:true});
  state.dataChannel=ch;
  ch.onopen=()=>{updateSenderStatus('Connected! Transferring...','success');startFileTransfer();};
  ch.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='chunk-ack'){state.senderState.chunksAcked++;updateSenderProgress();}}catch(err){}};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  state.ws.send(JSON.stringify({type:'offer',offer:pc.localDescription}));
}

function updateSenderStatus(text,type=''){const bar=document.getElementById('transfer-status-sender');bar.innerHTML='<span>'+text+'</span>';bar.className='status-bar '+type;}

// ==================== FILE TRANSFER ====================
const CHUNK_SIZE=16*1024*1024;
async function startFileTransfer(){
  const manifest=state.files.map(f=>({name:f.name,size:f.size,type:f.type||'application/octet-stream'}));
  state.manifest=manifest;state.senderState.startTime=Date.now();state.senderState.chunksAcked=0;
  state.senderState.totalChunks=state.files.reduce((a,f)=>a+Math.ceil(f.size/CHUNK_SIZE),0);
  state.dataChannel.send(JSON.stringify({type:'file-manifest',manifest}));
  renderSenderTransferFiles();await new Promise(r=>setTimeout(r,500));
  for(let i=0;i<state.files.length;i++){state.senderState.currentFile=i;updateFileStatus(i,'Sending...',false);await sendFile(i);updateFileStatus(i,'Done',true);}
  addHistory({type:'sent',files:state.files.map(f=>({name:f.name,size:f.size})),totalSize:state.files.reduce((a,f)=>a+f.size,0),time:Date.now()});
}
async function sendFile(fi){
  const file=state.files[fi];const tc=Math.ceil(file.size/CHUNK_SIZE);
  state.dataChannel.send(JSON.stringify({type:'file-start',fileIndex:fi,fileName:file.name,fileSize:file.size,totalChunks:tc}));
  let offset=0,ci=0;
  while(offset<file.size){
    const end=Math.min(offset+CHUNK_SIZE,file.size);
    const buf=await file.slice(offset,end).arrayBuffer();
    while(state.dataChannel.bufferedAmount>CHUNK_SIZE*2)await new Promise(r=>setTimeout(r,10));
    state.dataChannel.send(JSON.stringify({type:'file-chunk',fileIndex:fi,chunkIndex:ci,offset,size:buf.byteLength}));
    state.dataChannel.send(buf);offset=end;ci++;
    state.senderState.chunksAcked=calcAcked(fi,ci);updateSenderProgress();
  }
  state.dataChannel.send(JSON.stringify({type:'file-end',fileIndex:fi}));
}
function calcAcked(fi,ci){let a=0;for(let i=0;i<fi;i++)a+=Math.ceil(state.files[i].size/CHUNK_SIZE);return a+ci;}
function updateSenderProgress(){
  const{chunksAcked,totalChunks,startTime}=state.senderState;if(!totalChunks)return;
  const pct=Math.round(chunksAcked/totalChunks*100);const elapsed=(Date.now()-startTime)/1000;
  const speed=elapsed>0?chunksAcked*CHUNK_SIZE/elapsed:0;const eta=speed>0?(totalChunks-chunksAcked)*CHUNK_SIZE/speed:0;
  document.getElementById('progress-bar-sender').style.width=pct+'%';
  document.getElementById('progress-percent-sender').textContent=pct+'%';
  document.getElementById('progress-speed-sender').textContent=formatSpeed(speed);
  document.getElementById('progress-eta-sender').textContent=formatETA(eta);
  const cf=state.senderState.currentFile;if(cf<state.files.length){
    const fileEl=document.getElementById('sender-file-'+cf);
    if(fileEl){const fc=Math.ceil(state.files[cf].size/CHUNK_SIZE);const fa=chunksAcked-calcAcked(cf,0);const fp=Math.min(100,Math.round(fa/fc*100));const bar=fileEl.querySelector('.file-progress');if(bar)bar.style.width=fp+'%';}
  }
}
function renderSenderTransferFiles(){
  document.getElementById('transfer-files-sender').innerHTML=state.files.map((f,i)=>`<div class="transfer-file-item" id="sender-file-${i}"><div class="file-icon-small">${getFileIcon(f.name)}</div><span class="name">${f.name}</span><span class="size">${formatSize(f.size)}</span><div class="file-progress-wrap"><div class="file-progress"></div></div><span class="status" id="sender-file-status-${i}">Queued</span></div>`).join('');
}
function updateFileStatus(i,text,done=false){const el=document.getElementById('sender-file-status-'+i);if(el){el.textContent=text;el.className='status'+(done?' done':'');}}

// ==================== RECEIVER ====================
async function joinRoom(){
  const code=document.getElementById('room-code-input').value.trim().toUpperCase();
  if(code.length!==6){showJoinError('Enter a valid 6-digit code');return;}
  const pw=document.getElementById('join-password').classList.contains('hidden')?'':document.getElementById('join-password').value.trim();
  const btn=document.getElementById('join-btn');
  const originalText=btn.textContent;
  btn.disabled=true;btn.textContent='Connecting...';
  showJoinError('Waking up server...');
  try{await connectSignaling();state.ws.send(JSON.stringify({type:'join-room',code,password:pw||undefined}));}catch(e){showJoinError(e.message);}
  btn.disabled=false;btn.textContent=originalText;
}
function showJoinError(msg){const el=document.getElementById('join-error');el.textContent=msg;el.classList.remove('hidden');}
function onRoomJoined(code){
  document.getElementById('receiver-step-1').classList.add('hidden');
  document.getElementById('receiver-step-2').classList.remove('hidden');
  document.getElementById('chat-toggle').classList.remove('hidden');
  showToast('Connected to room '+code,'success');
}

async function onOffer(msg){try{await setupReceiverPeerConnection(msg);}catch(e){showToast('WebRTC error: '+e.message,'error');}}
async function setupReceiverPeerConnection(offerMsg){
  const pc=new RTCPeerConnection({iceServers:state.iceServers});
  state.peerConnection=pc;
  pc.onicecandidate=e=>{if(e.candidate)state.ws.send(JSON.stringify({type:'ice-candidate',candidate:e.candidate}));};
  pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed')updateReceiverStatus('Connection failed','error');};
  pc.ondatachannel=e=>{const ch=e.channel;state.dataChannel=ch;ch.onmessage=ev=>handleReceiverDataMessage(ev);};
  await pc.setRemoteDescription(new RTCSessionDescription(offerMsg.offer));
  const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
  state.ws.send(JSON.stringify({type:'answer',answer:pc.localDescription}));
}
async function onAnswer(msg){if(state.peerConnection)await state.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));}
async function onIceCandidate(msg){if(state.peerConnection&&msg.candidate)await state.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));}

// ==================== RECEIVER DATA ====================
let currentReceiveFile=null,currentFileBytesReceived=0;
function handleReceiverDataMessage(event){
  if(typeof event.data==='string'){
    const msg=JSON.parse(event.data);
    switch(msg.type){
      case'file-manifest':onReceiverManifest(msg);break;
      case'file-start':currentReceiveFile=msg.fileIndex;currentFileBytesReceived=0;updateReceiverFileStatus(msg.fileIndex,'Receiving...',0);break;
      case'file-end':const idx=msg.fileIndex;currentReceiveFile=null;currentFileBytesReceived=0;updateReceiverFileStatus(idx,'Done',100);assembleAndDownloadFile(idx);break;
    }
  }else if(currentReceiveFile!==null){
    state.transferState.fileBuffers[currentReceiveFile].push(event.data);
    state.transferState.bytesReceived+=event.data.byteLength;
    currentFileBytesReceived+=event.data.byteLength;
    state.dataChannel.send(JSON.stringify({type:'chunk-ack'}));
    updateReceiverProgress();updateReceiverFileProgress(currentReceiveFile);
  }
}
function onReceiverManifest(msg){
  state.manifest=msg.manifest;state.transferState.totalBytes=msg.manifest.reduce((a,f)=>a+f.size,0);
  state.transferState.bytesReceived=0;state.transferState.startTime=Date.now();
  state.transferState.fileBuffers=msg.manifest.map(()=>[]);state.transferState.filesCompleted=0;
  document.getElementById('receiver-step-2').classList.add('hidden');
  document.getElementById('receiver-step-3').classList.remove('hidden');
  renderReceiverTransferFiles();
}
function renderReceiverTransferFiles(){
  document.getElementById('transfer-files-receiver').innerHTML=state.manifest.map((f,i)=>`<div class="transfer-file-item" id="receiver-file-${i}"><div class="file-icon-small">${getFileIcon(f.name)}</div><span class="name">${f.name}</span><span class="size">${formatSize(f.size)}</span><div class="file-progress-wrap"><div class="file-progress"></div></div><span class="status" id="receiver-file-status-${i}">Waiting...</span></div>`).join('');
}
function updateReceiverFileStatus(i,text,pct){const el=document.getElementById('receiver-file-status-'+i);if(el){el.textContent=text;el.className='status'+(pct===100?' done':'');}const bar=document.getElementById('receiver-file-bar-'+i);if(bar&&pct!==undefined)bar.style.width=pct+'%';}
function updateReceiverFileProgress(i){const fsize=state.manifest[i].size;if(!fsize)return;const pct=Math.min(100,Math.round(currentFileBytesReceived/fsize*100));const items=document.getElementById('receiver-file-'+i);if(items){const bar=items.querySelector('.file-progress');if(bar)bar.style.width=pct+'%';const el=items.querySelector('.status');if(el&&!el.classList.contains('done'))el.textContent=pct+'%';}}
function assembleAndDownloadFile(fi){
  const info=state.manifest[fi];const chunks=state.transferState.fileBuffers[fi];if(!chunks.length)return;
  const blob=new Blob(chunks,{type:info.type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=info.name;a.style.display='none';
  document.body.appendChild(a);a.click();setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
  state.transferState.fileBuffers[fi]=[];state.transferState.filesCompleted++;
  if(state.transferState.filesCompleted>=state.manifest.length)onAllFilesReceived();
}
function onAllFilesReceived(){
  document.getElementById('receiver-step-3').classList.add('hidden');
  document.getElementById('receiver-step-4').classList.remove('hidden');
  const total=state.manifest.reduce((a,f)=>a+f.size,0);const elapsed=(Date.now()-state.transferState.startTime)/1000;
  const speed=elapsed>0?total/elapsed:0;
  document.getElementById('receiver-complete-info').innerHTML=state.manifest.length+' file'+(state.manifest.length>1?'s':'')+' received ('+formatSize(total)+') in '+formatETA(elapsed)+' at '+formatSpeed(speed);
  document.getElementById('received-files-list').innerHTML=state.manifest.map(f=>`<div class="file-item"><div class="file-icon-small">${getFileIcon(f.name)}</div><div class="file-info"><div class="file-name">${f.name}</div><div class="file-size">${formatSize(f.size)}</div></div><span class="status done">Downloaded</span></div>`).join('');
  if(state.dataChannel)state.dataChannel.send(JSON.stringify({type:'transfer-complete'}));
  addHistory({type:'received',files:state.manifest.map(f=>({name:f.name,size:f.size})),totalSize:total,time:Date.now()});
}
function updateReceiverProgress(){
  const{bytesReceived,totalBytes,startTime}=state.transferState;if(!totalBytes)return;
  const pct=Math.round(bytesReceived/totalBytes*100);const elapsed=(Date.now()-startTime)/1000;
  const speed=elapsed>0?bytesReceived/elapsed:0;const eta=speed>0?(totalBytes-bytesReceived)/speed:0;
  document.getElementById('progress-bar-receiver').style.width=pct+'%';
  document.getElementById('progress-percent-receiver').textContent=pct+'%';
  document.getElementById('progress-speed-receiver').textContent=formatSpeed(speed);
  document.getElementById('progress-eta-receiver').textContent=formatETA(eta);
}
function updateReceiverStatus(text,type=''){const bar=document.getElementById('transfer-status-receiver');bar.innerHTML='<span>'+text+'</span>';bar.className='status-bar '+type;}

// ==================== CHAT ====================
function toggleChat(){
  state.chatOpen=!state.chatOpen;
  document.getElementById('chat-panel').classList.toggle('hidden',!state.chatOpen);
  if(state.chatOpen){state.chatUnread=0;document.getElementById('chat-badge').classList.add('hidden');}
}
function sendChatMessage(){
  const input=document.getElementById('chat-input');const text=input.value.trim();if(!text)return;
  input.value='';
  addChatBubble(text,true);
  if(state.ws&&state.ws.readyState===1)state.ws.send(JSON.stringify({type:'chat',text}));
}
function onChatMessage(msg){
  addChatBubble(msg.text,false);
  if(!state.chatOpen){state.chatUnread++;const b=document.getElementById('chat-badge');b.textContent=state.chatUnread;b.classList.remove('hidden');}
}
function addChatBubble(text,sent){
  const container=document.getElementById('chat-messages');
  const div=document.createElement('div');
  div.className='chat-msg '+(sent?'sent':'received');
  const now=new Date();const time=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  div.innerHTML=text+'<div class="time">'+time+'</div>';
  container.appendChild(div);container.scrollTop=container.scrollHeight;
}
document.getElementById('chat-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')sendChatMessage();});

// ==================== OTHER ====================
function handleError(code){
  const msgs={'ROOM_NOT_FOUND':'Room not found.','ROOM_FULL':'Room is full.','ROOM_EXPIRED':'Room expired.','HOST_DISCONNECTED':'Sender disconnected.','WRONG_PASSWORD':'Wrong password.'};
  const m=msgs[code]||'Error: '+code;
  if(code==='WRONG_PASSWORD'){document.getElementById('join-error').classList.remove('hidden');document.getElementById('join-password').classList.remove('hidden');}
  state.role==='receiver'?showJoinError(m):showToast(m,'error');
}
function onTransferComplete(){
  if(state.role==='sender'){
    document.getElementById('sender-step-3').classList.add('hidden');
    document.getElementById('sender-step-4').classList.remove('hidden');
    const total=state.files.reduce((a,f)=>a+f.size,0);const elapsed=(Date.now()-state.senderState.startTime)/1000;const speed=elapsed>0?total/elapsed:0;
    document.getElementById('sender-complete-info').innerHTML=state.files.length+' file'+(state.files.length>1?'s':'')+' sent ('+formatSize(total)+') in '+formatETA(elapsed)+' at '+formatSpeed(speed);
  }
}
function onPeerDisconnected(){showToast('Peer disconnected','error');}

// ==================== RESET ====================
function resetSender(){
  state.role=null;state.files=[];state.roomCode=null;state.manifest=null;
  if(state.ws){state.ws.close();state.ws=null;}if(state.peerConnection){state.peerConnection.close();state.peerConnection=null;}if(state.dataChannel){state.dataChannel=null;}
  state.senderState={chunksAcked:0,totalChunks:0,startTime:null,currentFile:0};
  ['sender-step-1','sender-step-2','sender-step-3','sender-step-4'].forEach((id,i)=>{document.getElementById(id).classList.toggle('hidden',i!==0);});
  document.getElementById('chat-toggle').classList.add('hidden');
  document.getElementById('chat-panel').classList.add('hidden');
  state.chatOpen=false;
  renderFileList();showView('view-sender');
}
function resetReceiver(){
  state.role=null;state.roomCode=null;state.manifest=null;
  state.transferState={bytesReceived:0,totalBytes:0,startTime:null,fileBuffers:[],filesCompleted:0};
  if(state.ws){state.ws.close();state.ws=null;}if(state.peerConnection){state.peerConnection.close();state.peerConnection=null;}if(state.dataChannel){state.dataChannel=null;}
  ['receiver-step-1','receiver-step-2','receiver-step-3','receiver-step-4'].forEach((id,i)=>{document.getElementById(id).classList.toggle('hidden',i!==0);});
  document.getElementById('room-code-input').value='';document.getElementById('join-error').classList.add('hidden');
  document.getElementById('chat-toggle').classList.add('hidden');
  document.getElementById('chat-panel').classList.add('hidden');
  state.chatOpen=false;
  showView('view-receiver');
}

// ==================== AUTO-JOIN ====================
window.addEventListener('DOMContentLoaded',()=>{
  const match=location.pathname.match(/\/join\/([A-Z0-9]{6})/i);
  if(match){state.role='receiver';showView('view-receiver');document.getElementById('room-code-input').value=match[1].toUpperCase();document.getElementById('join-password').classList.remove('hidden');joinRoom();}
  renderHistory();
});
document.getElementById('room-code-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom();});

// 3D CARD TILT EFFECT
document.addEventListener('mousemove',e=>{
  document.querySelectorAll('.card-3d').forEach(card=>{
    const rect=card.getBoundingClientRect();
    const x=e.clientX-rect.left;const y=e.clientY-rect.top;
    if(x<0||x>rect.width||y<0||y>rect.height)return;
    const rotateX=(y-rect.height/2)/20;const rotateY=(rect.width/2-x)/20;
    card.style.transform='perspective(800px) rotateX('+rotateX+'deg) rotateY('+rotateY+'deg) translateY(-4px)';
  });
});
document.querySelectorAll('.card-3d').forEach(card=>{
  card.addEventListener('mouseleave',()=>{card.style.transform='';});
});
