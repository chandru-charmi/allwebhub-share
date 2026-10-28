const $=id=>document.getElementById(id), CH=16384;
let pc,dc,rx=null;
const enc=d=>btoa(JSON.stringify({type:d.type,sdp:d.sdp}));
const dec=t=>JSON.parse(atob(t.trim()));
const status=t=>$('status').textContent=t;
const prog=(t,v)=>{$('plabel').textContent=t;$('prog').value=v};

function mk(){
  pc=new RTCPeerConnection({iceServers:[]}); // no STUN/TURN: local network only
  pc.onconnectionstatechange=()=>{
    status(pc.connectionState);
    if(pc.connectionState==='connected'){$('pair').hidden=true;$('xfer').hidden=false}
  };
  pc.ondatachannel=e=>chan(e.channel);
}
const ice=()=>new Promise(r=>{
  if(pc.iceGatheringState==='complete')return r();
  pc.addEventListener('icegatheringstatechange',()=>pc.iceGatheringState==='complete'&&r());
  setTimeout(r,3000);
});
function qr(id,text){
  const el=$(id);el.innerHTML='';
  if(window.QRCode)new QRCode(el,{text,width:260,height:260,correctLevel:QRCode.CorrectLevel.L});
  else el.textContent='QR library not added yet. Use Copy instead.';
}

function chan(c){
  dc=c;c.binaryType='arraybuffer';c.bufferedAmountLowThreshold=262144;
  c.onmessage=e=>{
    if(typeof e.data==='string'){
      const m=JSON.parse(e.data);
      if(m.name){rx={m,parts:[],n:0};prog('Receiving '+m.name,0)}
      else if(rx){addRx(rx.m.name,new Blob(rx.parts,{type:rx.m.type}));rx=null;prog('',0)}
    }else if(rx){rx.parts.push(e.data);rx.n+=e.data.byteLength;prog('Receiving '+rx.m.name,rx.n/(rx.m.size||1))}
  };
  c.onclose=()=>status('Disconnected');
}
async function send(f){
  dc.send(JSON.stringify({name:f.name,size:f.size,type:f.type}));
  for(let o=0;o<f.size;o+=CH){
    if(dc.bufferedAmount>1048576)await new Promise(r=>dc.addEventListener('bufferedamountlow',r,{once:true}));
    dc.send(await f.slice(o,o+CH).arrayBuffer());
    prog('Sending '+f.name,Math.min(1,(o+CH)/f.size));
  }
  dc.send(JSON.stringify({done:1}));prog('',0);
}
function addRx(name,blob){
  const l=$('rxList');l.querySelector('.empty')?.remove();
  const li=document.createElement('li'),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;a.textContent=name;
  const s=document.createElement('span');s.textContent=(blob.size/1048576).toFixed(2)+' MB';
  li.append(a,s);l.prepend(li);
}

$('btnHost').onclick=async()=>{
  $('hostBox').hidden=false;$('joinBox').hidden=true;
  mk();chan(pc.createDataChannel('files'));
  await pc.setLocalDescription(await pc.createOffer());await ice();
  const t=enc(pc.localDescription);$('offerOut').value=t;qr('offerQR',t);
};
$('btnAccept').onclick=async()=>{
  try{await pc.setRemoteDescription(dec($('answerIn').value));status('Connecting...')}
  catch(e){alert('That reply is not valid. Copy or scan it again.')}
};
$('btnJoin').onclick=()=>{$('joinBox').hidden=false;$('hostBox').hidden=true};
$('btnReply').onclick=async()=>{
  try{
    mk();await pc.setRemoteDescription(dec($('offerIn').value));
    await pc.setLocalDescription(await pc.createAnswer());await ice();
    const t=enc(pc.localDescription);$('answerOut').value=t;qr('answerQR',t);$('replyBox').hidden=false;
  }catch(e){alert('That code is not valid. Copy or scan it again.')}
};
$('btnSend').onclick=async()=>{
  if(!dc||dc.readyState!=='open')return alert('Not connected yet.');
  for(const f of $('file').files)await send(f);
  $('file').value='';
};
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
  const t=$(b.dataset.copy);t.select();
  try{await navigator.clipboard.writeText(t.value)}catch(e){document.execCommand('copy')}
  b.textContent='Copied';setTimeout(()=>b.textContent=b.textContent==='Copied'?'Copy again':b.textContent,1500);
});
document.querySelectorAll('[data-scan]').forEach(b=>b.onclick=()=>scan(b.dataset.scan));

async function scan(target){
  const box=$('cam'),v=document.createElement('video');v.setAttribute('playsinline','');
  let s;
  try{s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})}
  catch(e){return alert('Camera not available. Paste the code instead.')}
  const det=window.BarcodeDetector?new BarcodeDetector({formats:['qr_code']}):null;
  if(!det&&!window.jsQR){s.getTracks().forEach(t=>t.stop());return alert('Add js/jsQR.js to enable scanning, or paste the code.')}
  box.prepend(v);box.hidden=false;v.srcObject=s;await v.play();
  const c=document.createElement('canvas'),x=c.getContext('2d',{willReadFrequently:true});
  const stop=()=>{s.getTracks().forEach(t=>t.stop());v.srcObject=null;v.remove();box.hidden=true};
  $('stopCam').onclick=stop;
  const tick=async()=>{
    if(!v.srcObject)return;
    let txt=null;
    if(v.videoWidth){
      c.width=v.videoWidth;c.height=v.videoHeight;x.drawImage(v,0,0);
      if(det){const r=await det.detect(c);if(r[0])txt=r[0].rawValue}
      else{const d=x.getImageData(0,0,c.width,c.height),r=jsQR(d.data,d.width,d.height);if(r)txt=r.data}
    }
    if(txt){$(target).value=txt;stop()}else requestAnimationFrame(tick);
  };
  tick();
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
