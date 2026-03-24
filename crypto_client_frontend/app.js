/* ─── DB ─── */
const DB = { users:{}, sessions:{} };
function hashPass(p){let h=5381;for(let i=0;i<p.length;i++)h=((h<<5)+h)^p.charCodeAt(i);return(h>>>0).toString(36);}
function genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
let session=null;
function currentUser(){return session?DB.users[session.email]:null;}
const encryptedBlobs={};

/* ─── Tabs ─── */
let activeTab='enc';
function switchTab(tab){
	activeTab=tab;
	['enc','dec','mgr'].forEach(t=>{
		const panel=document.getElementById('panel'+cap(t));
		panel.classList.toggle('active',t===tab);
		const btn=document.getElementById('tab'+cap(t));
		btn.className='tab-btn'+(t===tab?' active-'+t:'');
	});
	if(tab==='mgr')renderMgrTab();
}

/* ─── Manage sub-tabs ─── */
let mgrTab='enc';
function switchMgrTab(t){
	mgrTab=t;
	document.getElementById('mgrEncBtn').classList.toggle('active',t==='enc');
	document.getElementById('mgrDecBtn').classList.toggle('active',t==='dec');
	document.getElementById('mgrDeleteBtn').classList.toggle('active',t==='delete');
	document.getElementById('mgrEncSection').classList.toggle('active',t==='enc');
	document.getElementById('mgrDecSection').classList.toggle('active',t==='dec');
	document.getElementById('mgrDeleteSection').classList.toggle('active',t==='delete');
}

function renderMgrTab(){
	const u=currentUser();
	document.getElementById('mgrLoginWall').style.display=u?'none':'flex';
	const mc=document.getElementById('mgrContent');
	mc.style.display=u?'flex':'none';
	if(!u)return;
	renderMgrList('enc');
	renderMgrList('dec');
}

function renderMgrList(side){
	const u=currentUser();if(!u)return;
	const hist=side==='enc'?u.encHistory:u.decHistory;
	const listEl=document.getElementById('mgr'+cap(side)+'List');
	const foot=document.getElementById('mgr'+cap(side)+'Footer');
	const countEl=document.getElementById('mgr'+cap(side)+'Count');
	foot.style.display=hist.length?'flex':'none';
	if(countEl)countEl.textContent=hist.length+' file'+(hist.length!==1?'s':'');
	if(!hist.length){
		listEl.innerHTML=side==='enc'
			?'<div class="mgr-empty"><span class="mgr-empty-icon"></span><p>No encrypted files saved yet.<br>Encrypt a file in Online mode first.</p></div>'
			:'<div class="mgr-empty"><span class="mgr-empty-icon"></span><p>No decryption history yet.</p></div>';
		return;
	}
	listEl.innerHTML=hist.map(h=>{
		const name=h.origName||h.name;
		const meta=side==='enc'
			?h.algo+' · '+h.size+' · '+h.date
			:'From: '+(h.encName||h.name)+' · '+h.size+' · '+h.date;
		const icon=side==='enc'?'':'';
		const dlBtn=side==='enc'
			?'<button class="mgr-btn mgr-btn-dl" onclick="triggerDownload(encryptedBlobs,\''+h.id+'\')">↓ Download</button><span class="mgr-btn-sep"></span>':'' ;
		return '<div class="mgr-row">'+
			'<span class="mgr-row-icon">'+icon+'</span>'+
			'<div class="mgr-row-info">'+
				'<div class="mgr-row-name" title="'+esc(name)+'">'+esc(name)+'</div>'+
				'<div class="mgr-row-meta">'+meta+'</div>'+
			'</div>'+
			'<div class="mgr-row-actions">'+dlBtn+
				'<button class="mgr-btn mgr-btn-del" onclick="askDelete(\''+side+'\',\''+h.id+'\',\''+escQ(name)+'\')">🗑 Delete</button>'+
			'</div></div>';
	}).join('');
}

function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escQ(s){return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");}

/* ─── Confirm delete ─── */
let pendingAction=null;
function askDelete(side,id,name){
	pendingAction=()=>deleteItem(side,id);
	document.getElementById('confirmTitle').textContent='Delete "'+name+'"?';
	document.getElementById('confirmDesc').textContent=side==='enc'
		?'The encrypted file will be removed from your account permanently.'
		:'This history entry will be removed.';
	document.getElementById('confirmOkBtn').textContent='Delete';
	document.getElementById('confirmOverlay').classList.add('visible');
}
function askDeleteAll(side){
	pendingAction=()=>deleteAll(side);
	document.getElementById('confirmTitle').textContent=side==='enc'?'Delete all encrypted files?':'Clear all decryption history?';
	document.getElementById('confirmDesc').textContent='This cannot be undone.';
	document.getElementById('confirmOkBtn').textContent=side==='enc'?'Delete All':'Clear All';
	document.getElementById('confirmOverlay').classList.add('visible');
}
function closeConfirm(){pendingAction=null;document.getElementById('confirmOverlay').classList.remove('visible');}
function runConfirm(){if(pendingAction)pendingAction();closeConfirm();}

function deleteItem(side,id){
	const u=currentUser();if(!u)return;
	if(side==='enc'){
		u.encHistory=u.encHistory.filter(h=>h.id!==id);
		delete encryptedBlobs[id];
		if(selectedOnlineEncId===id){selectedOnlineEncId=null;resetFileSelectBox();hideOnlineDecControls();}
		renderFileSelectDropdown();
	} else {
		u.decHistory=u.decHistory.filter(h=>h.id!==id);
	}
	renderMgrList(side);
	toast('Entry deleted.');
}

function deleteAll(side){
	const u=currentUser();if(!u)return;
	if(side==='enc'){
		u.encHistory.forEach(h=>{delete encryptedBlobs[h.id];});
		u.encHistory=[];
		selectedOnlineEncId=null;resetFileSelectBox();hideOnlineDecControls();
		renderFileSelectDropdown();
	} else {
		u.decHistory=[];
	}
	renderMgrList(side);
	toast(side==='enc'?'All encrypted files deleted.':'History cleared.');
}

/* ─── Auth ─── */
let authMode='login';
function showAuth(mode){
	authMode=mode;
	['authError','authName','authEmail','authPass'].forEach(id=>{const el=document.getElementById(id);if(el.tagName==='INPUT')el.value='';else el.textContent='';});
	const s=mode==='signup';
	document.getElementById('authTitle').textContent=s?'Create account':'Welcome back';
	document.getElementById('authSub').textContent=s?'Sign up to save your history.':'Login to your account to continue.';
	document.getElementById('nameField').style.display=s?'flex':'none';
	document.getElementById('authSubmitBtn').textContent=s?'Sign Up':'Login';
	document.getElementById('authSwitch').innerHTML=s
		?'Already have an account? <span onclick="switchAuthMode()">Login</span>'
		:"Don't have an account? <span onclick=\"switchAuthMode()\">Sign Up</span>";
	document.getElementById('authOverlay').classList.add('visible');
	setTimeout(()=>document.getElementById('authEmail').focus(),50);
}
function switchAuthMode(){showAuth(authMode==='login'?'signup':'login');}
function closeAuth(){document.getElementById('authOverlay').classList.remove('visible');}

function submitAuth(){
	const email=document.getElementById('authEmail').value.trim().toLowerCase();
	const pass=document.getElementById('authPass').value;
	const name=document.getElementById('authName').value.trim();
	const errEl=document.getElementById('authError');
	errEl.textContent='';
	if(!email||!pass){errEl.textContent='Please fill in all fields.';return;}
	if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){errEl.textContent='Enter a valid email address.';return;}
	if(pass.length<6){errEl.textContent='Password must be at least 6 characters.';return;}
	const hash=hashPass(pass);
	if(authMode==='signup'){
		if(!name){errEl.textContent='Please enter your name.';return;}
		if(DB.users[email]){errEl.textContent='Account already exists. Please login.';return;}
		DB.users[email]={name,passwordHash:hash,
			createdAt:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
			encHistory:[],decHistory:[]};
		toast('Welcome, '+name+'!');
	} else {
		const u=DB.users[email];
		if(!u){errEl.textContent='No account found. Please sign up first.';return;}
		if(u.passwordHash!==hash){errEl.textContent='Incorrect password.';return;}
		toast('Welcome back, '+u.name+'!');
	}
	const sid=genId();DB.sessions[sid]=email;session={sid,email};
	closeAuth();onLogin();
}

function logout(){
	if(session)delete DB.sessions[session.sid];
	session=null;closeProfile();onLogout();toast('Logged out.');
}

function onLogin(){
	const u=currentUser();
	const init=u.name.charAt(0).toUpperCase();
	document.getElementById('topbarActions').innerHTML=
		'<div class="user-chip" onclick="openProfile()"><div class="avatar">'+init+'</div>'+u.name.split(' ')[0]+'</div>';
	if(document.getElementById('encOnlineBtn').classList.contains('active')){
		document.getElementById('encLoginWall').style.display='none';
		document.getElementById('encMainContent').style.display='block';
		document.getElementById('encFormContent').style.display='flex';
	}
	if(document.getElementById('decOnlineBtn').classList.contains('active')){
		document.getElementById('decLoginWall').style.display='none';
		document.getElementById('decOnlineContent').style.display='block';
		renderFileSelectDropdown();
	}
	if(activeTab==='mgr')renderMgrTab();
}

function onLogout(){
	document.getElementById('topbarActions').innerHTML=
		'<button class="btn btn-ghost" onclick="showAuth(\'login\')">Login</button>'+
		'<button class="btn btn-primary" onclick="showAuth(\'signup\')">Sign Up</button>';
	if(document.getElementById('encOnlineBtn').classList.contains('active')){
		document.getElementById('encLoginWall').style.display='flex';
		document.getElementById('encMainContent').style.display='none';
		document.getElementById('encFormContent').style.display='none';
	}
	if(document.getElementById('decOnlineBtn').classList.contains('active')){
		document.getElementById('decLoginWall').style.display='flex';
		document.getElementById('decOnlineContent').style.display='none';
		hideOnlineDecControls();
	}
	if(activeTab==='mgr')renderMgrTab();
}

function openProfile(){
	const u=currentUser();if(!u)return;
	document.getElementById('profileAvatar').textContent=u.name.charAt(0).toUpperCase();
	document.getElementById('profileName').textContent=u.name;
	document.getElementById('profileEmailDisp').textContent=session.email;
	document.getElementById('profileSince').textContent=u.createdAt;
	document.getElementById('profileEncCount').textContent=u.encHistory.length;
	document.getElementById('profileDecCount').textContent=u.decHistory.length;
	const ac={};u.encHistory.forEach(h=>{ac[h.algo]=(ac[h.algo]||0)+1;});
	const top=Object.entries(ac).sort((a,b)=>b[1]-a[1])[0];
	document.getElementById('profileAlgo').textContent=top?top[0]:'AES-256-GCM';
	document.getElementById('profileOverlay').classList.add('visible');
}
function closeProfile(){document.getElementById('profileOverlay').classList.remove('visible');}

/* ─── Mode toggle ─── */
function setMode(side,mode){
	document.getElementById(side+'DesktopBtn').classList.toggle('active',mode==='desktop');
	document.getElementById(side+'OnlineBtn').classList.toggle('active',mode==='online');
	if(side==='enc'){
		const li=!!currentUser();
		if(mode==='online'){
			document.getElementById('encLoginWall').style.display=li?'none':'flex';
			document.getElementById('encMainContent').style.display=li?'block':'none';
			document.getElementById('encFormContent').style.display=li?'flex':'none';
		} else {
			document.getElementById('encLoginWall').style.display='none';
			document.getElementById('encMainContent').style.display='block';
			document.getElementById('encFormContent').style.display='flex';
		}
	} else {
		document.getElementById('decDesktopPanel').style.display=mode==='desktop'?'block':'none';
		document.getElementById('decOnlinePanel').style.display=mode==='online'?'block':'none';
		const li=!!currentUser();
		if(mode==='online'){
			document.getElementById('decLoginWall').style.display=li?'none':'flex';
			document.getElementById('decOnlineContent').style.display=li?'block':'none';
			if(!li){hideOnlineDecControls();setStatus('dec','','');}
			else{selectedOnlineEncId=null;closeFileDropdown();resetFileSelectBox();hideOnlineDecControls();setStatus('dec','','');renderFileSelectDropdown();}
		} else {
			selectedOnlineEncId=null;closeFileDropdown();
			showDesktopDecControls();setStatus('dec','No file selected','');
		}
	}
}

function showDesktopDecControls(){document.getElementById('decPassField').style.display='flex';document.getElementById('decryptBtn').style.display='block';}
function hideOnlineDecControls(){document.getElementById('decPassField').style.display='none';document.getElementById('decryptBtn').style.display='none';document.getElementById('decPassword').value='';}
function showOnlineDecControls(){document.getElementById('decPassField').style.display='flex';document.getElementById('decryptBtn').style.display='block';}

/* ─── Online file selector ─── */
let selectedOnlineEncId=null,fileDropdownOpen=false;
function toggleFileDropdown(e){if(e)e.stopPropagation();fileDropdownOpen?closeFileDropdown():openFileDropdown();}
function openFileDropdown(){renderFileSelectDropdown();document.getElementById('fileSelectDropdown').style.display='block';document.getElementById('fileSelectBox').classList.add('open');fileDropdownOpen=true;}
function closeFileDropdown(){const dd=document.getElementById('fileSelectDropdown');if(dd)dd.style.display='none';const box=document.getElementById('fileSelectBox');if(box)box.classList.remove('open');fileDropdownOpen=false;}
function resetFileSelectBox(){const l=document.getElementById('fileSelectLabel');if(l){l.textContent='Choose a file to decrypt';l.classList.add('placeholder');}}
function renderFileSelectDropdown(){
	const dd=document.getElementById('fileSelectDropdown');if(!dd)return;
	const u=currentUser();
	if(!u||!u.encHistory.length){dd.innerHTML='<p class="file-select-empty">No encrypted files yet. Encrypt a file in Online mode first.</p>';return;}
	dd.innerHTML=u.encHistory.map(h=>
		'<div class="file-select-option '+(selectedOnlineEncId===h.id?'selected':'')+'" onclick="selectOnlineFile(event,\''+h.id+'\')">'+
		'<div class="file-select-option-info">'+
			'<div class="file-select-option-name" title="'+esc(h.origName)+'">'+esc(h.origName)+'</div>'+
			'<div class="file-select-option-meta">'+h.algo+' · '+h.size+' · '+h.date+'</div>'+
		'</div></div>'
	).join('');
}
function selectOnlineFile(e,id){
	if(e)e.stopPropagation();
	selectedOnlineEncId=id;
	const u=currentUser();const entry=u?u.encHistory.find(h=>h.id===id):null;
	if(entry){const l=document.getElementById('fileSelectLabel');l.textContent=entry.origName;l.classList.remove('placeholder');}
	closeFileDropdown();showOnlineDecControls();setStatus('dec','', '');
	document.getElementById('decPassword').focus();
}
document.addEventListener('click',e=>{
	if(!fileDropdownOpen)return;
	const wrap=document.getElementById('fileSelectWrap');
	if(wrap&&!wrap.contains(e.target))closeFileDropdown();
});

/* ─── Drop zones ─── */
let encFile=null,decFile=null;
function wireDropZone(dropId,inputId,cb){
	const drop=document.getElementById(dropId),input=document.getElementById(inputId);
	drop.addEventListener('click',e=>{e.stopPropagation();input.click();});
	input.addEventListener('change',()=>{if(input.files[0])cb(input.files[0]);});
	drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover');});
	drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
	drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');if(e.dataTransfer.files[0])cb(e.dataTransfer.files[0]);});
}
wireDropZone('encDrop','encFileInput',f=>{encFile=f;document.getElementById('encFileName').textContent=f.name+' ('+fmtSize(f.size)+')';setStatus('enc','File ready','');});
wireDropZone('decDrop','decFileInput',f=>{decFile=f;document.getElementById('decFileName').textContent=f.name+' ('+fmtSize(f.size)+')';setStatus('dec','File ready','');});

function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function fmtDate(){return new Date().toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}

/* ─── Password toggle ─── */
const EYE_OPEN='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT='<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function togglePass(id,btn){const inp=document.getElementById(id);const show=inp.type==='password';inp.type=show?'text':'password';btn.innerHTML=show?EYE_SHUT:EYE_OPEN;}

/* ─── Progress ─── */
function showProgress(side,label){const w=document.getElementById(side+'ProgressWrap'),f=document.getElementById(side+'ProgressFill');w.classList.add('visible');document.getElementById(side+'ProgressLabel').textContent=label;document.getElementById(side+'ProgressPct').textContent='0%';f.style.width='0%';f.classList.remove('done');}
function setProgress(side,pct){document.getElementById(side+'ProgressFill').style.width=pct+'%';document.getElementById(side+'ProgressPct').textContent=pct+'%';}
function finishProgress(side,label){const f=document.getElementById(side+'ProgressFill');f.classList.add('done');f.style.width='100%';document.getElementById(side+'ProgressPct').textContent='100%';document.getElementById(side+'ProgressLabel').textContent=label;setTimeout(()=>{document.getElementById(side+'ProgressWrap').classList.remove('visible');f.classList.remove('done');f.style.width='0%';},1800);}

/* ─── Encrypt ─── */
async function encryptFile(){
	if(!encFile){setStatus('enc','Please select a file first.','err');return;}
	const pass=document.getElementById('encPassword').value;
	if(!pass){setStatus('enc','Please enter a password.','err');return;}
	const algo=document.getElementById('algorithm').value;
	const btn=document.getElementById('encryptBtn');
	const isOnline=document.getElementById('encOnlineBtn').classList.contains('active');
	btn.disabled=true;setStatus('enc','', '');showProgress('enc','Reading file...');setProgress('enc',10);
	try{
		const buf=await encFile.arrayBuffer();setProgress('enc',30);
		const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);setProgress('enc',50);
		const salt=crypto.getRandomValues(new Uint8Array(16));
		const iv=crypto.getRandomValues(new Uint8Array(12));
		const keyLen=algo==='AES-128-CTR'?128:256;
		const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:keyLen},false,['encrypt']);setProgress('enc',70);
		const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,buf);setProgress('enc',90);
		const out=new Uint8Array(1+16+12+cipher.byteLength);
		out[0]=keyLen===256?1:0;out.set(salt,1);out.set(iv,17);out.set(new Uint8Array(cipher),29);
		const blob=new Blob([out],{type:'application/octet-stream'});
		const encName=encFile.name+'.enc';
		const id=genId();
		encryptedBlobs[id]={blob,name:encName};
		const u=currentUser();
		if(u){
			u.encHistory.unshift({id,name:encName,origName:encFile.name,algo,size:fmtSize(blob.size),date:fmtDate()});
			if(activeTab==='mgr')renderMgrList('enc');
			renderFileSelectDropdown();
		}
		if(isOnline){setStatus('enc','Saved to account: '+encName,'ok');}
		else{triggerDownload(encryptedBlobs,id);setStatus('enc','Encrypted & downloaded: '+encName,'ok');}
		finishProgress('enc','Done');toast('File encrypted successfully.');
	}catch(e){
		document.getElementById('encProgressWrap').classList.remove('visible');
		setStatus('enc','Encryption failed. Please try again.','err');console.error(e);
	}
	btn.disabled=false;
}

/* ─── Decrypt ─── */
async function decryptFile(){
	const isOnline=document.getElementById('decOnlineBtn').classList.contains('active');
	const pass=document.getElementById('decPassword').value;
	if(!pass){setStatus('dec','Please enter the password.','err');return;}
	let sourceBlob,sourceName;
	if(isOnline){
		if(!selectedOnlineEncId){setStatus('dec','Please select a file to decrypt.','err');return;}
		const stored=encryptedBlobs[selectedOnlineEncId];
		if(!stored){setStatus('dec','File data not found. Please re-encrypt in this session.','err');return;}
		sourceBlob=stored.blob;sourceName=stored.name;
	}else{
		if(!decFile){setStatus('dec','Please select a .enc file first.','err');return;}
		if(!decFile.name.endsWith('.enc')){setStatus('dec','File must be a .enc file encrypted by Encryptix.','err');return;}
		sourceBlob=decFile;sourceName=decFile.name;
	}
	const btn=document.getElementById('decryptBtn');
	btn.disabled=true;setStatus('dec','', '');showProgress('dec','Reading file...');setProgress('dec',10);
	try{
		const buf=await sourceBlob.arrayBuffer();
		const data=new Uint8Array(buf);setProgress('dec',30);
		if(data.length<30)throw new Error('Invalid file');
		const keyLen=data[0]===1?256:128;
		const salt=data.slice(1,17),iv=data.slice(17,29),cipher=data.slice(29);
		const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);setProgress('dec',55);
		const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:keyLen},false,['decrypt']);setProgress('dec',75);
		const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher);setProgress('dec',90);
		const origName=sourceName.replace(/\.enc$/,'');
		const blob=new Blob([plain],{type:'application/octet-stream'});
		const id=genId();
		triggerDownload({[id]:{blob,name:origName}},id);
		const u=currentUser();
		if(u){
			u.decHistory.unshift({id,origName,encName:sourceName,size:fmtSize(blob.size),date:fmtDate()});
			if(activeTab==='mgr')renderMgrList('dec');
		}
		finishProgress('dec','Done');setStatus('dec','Decrypted & downloaded: '+origName,'ok');toast('File decrypted successfully.');
	}catch(e){
		document.getElementById('decProgressWrap').classList.remove('visible');
		setStatus('dec',e.name==='OperationError'?'Wrong password or corrupted file.':'Decryption failed. Is this a valid .enc file?','err');
		console.error(e);
	}
	btn.disabled=false;
}

/* ─── Download ─── */
function triggerDownload(store,id){const item=store[id];if(!item){toast('File no longer available.');return;}const url=URL.createObjectURL(item.blob);const a=Object.assign(document.createElement('a'),{href:url,download:item.name});document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),3000);}

/* ─── Status / Toast ─── */
function setStatus(side,msg,cls){const el=document.getElementById(side+'Status');if(!el)return;el.textContent=msg;el.className='status-line '+cls;}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3200);}

/* ─── Overlay close ─── */
document.getElementById('authOverlay').addEventListener('click',e=>{if(e.target.id==='authOverlay')closeAuth();});
document.getElementById('profileOverlay').addEventListener('click',e=>{if(e.target.id==='profileOverlay')closeProfile();});
document.getElementById('confirmOverlay').addEventListener('click',e=>{if(e.target.id==='confirmOverlay')closeConfirm();});
['authName','authEmail','authPass'].forEach(id=>{document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')submitAuth();});});
