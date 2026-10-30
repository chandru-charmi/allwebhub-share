const $=id=>document.getElementById(id), CH=16384;
let pc,dc,rx=null;
const pack=d=>{
  const L=d.sdp.split(/\r?\n/),g=p=>(L.find(l=>l.startsWith(p))||'').slice(p.length);
  const c=L.filter(l=>l.startsWith('a=candidate:')&&/ udp /i.test(l)).map(l=>l.slice(12)).filter(l=>{const a=l.split(' ')[4];return a&&!a.includes(':')});
  return JSON.stringify([d.type[0],g('a=ice-ufrag:'),g('a=ice-pwd:'),g('a=fingerprint:sha-256 ').replace(/:/g,''),c]);
};
const unpack=t=>{
  const [ty,u,p,f,c]=JSON.parse(t.trim());
  const sdp=['v=0','o=- 1 2 IN IP4 127.0.0.1','s=-','t=0 0','a=group:BUNDLE 0','m=application 9 UDP/DTLS/SCTP webrtc-datachannel','c=IN IP4 0.0.0.0','a=ice-ufrag:'+u,'a=ice-pwd:'+p,'a=fingerprint:sha-256 '+f.match(/../g).join(':'),'a=setup:'+(ty==='o'?'actpass':'active'),'a=mid:0','a=sctp-port:5000','a=max-message-size:262144',...c.map(x=>'a=candidate:'+x),'a=end-of-candidates',''].join('\r\n');
  return {type:ty==='o'?'offer':'answer',sdp};
};
const enc=pack, dec=unpack; // short code: small, easy-to-scan QR
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
  if(window.QRCode)new QRCode(el,{text,width:300,height:300,correctLevel:QRCode.CorrectLevel.L});
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

async function accept(){
  try{await pc.setRemoteDescription(dec($('answerIn').value));status('Connecting...')}
  catch(e){alert('That reply is not valid. Scan or paste it again.')}
}
async function reply(){
  try{
    mk();await pc.setRemoteDescription(dec($('offerIn').value));
    await pc.setLocalDescription(await pc.createAnswer());await ice();
    const t=enc(pc.localDescription);$('answerOut').value=t;qr('answerQR',t);$('replyBox').hidden=false;status('Waiting for the first device...');
  }catch(e){alert('That code is not valid. Scan or paste it again.')}
}
$('btnHost').onclick=async()=>{
  $('hostBox').hidden=false;$('joinBox').hidden=true;
  mk();chan(pc.createDataChannel('files'));
  await pc.setLocalDescription(await pc.createOffer());await ice();
  const t=enc(pc.localDescription);$('offerOut').value=t;qr('offerQR',t);
};
$('btnJoin').onclick=()=>{$('joinBox').hidden=false;$('hostBox').hidden=true;scan('offerIn',reply)};
$('btnScanOffer').onclick=()=>scan('offerIn',reply);
$('btnScanAnswer').onclick=()=>scan('answerIn',accept);
$('btnAccept').onclick=accept;$('btnReply').onclick=reply;
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

async function scan(target,cb){
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
    if(txt){$(target).value=txt;stop();cb&&cb()}else requestAnimationFrame(tick);
  };
  tick();
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
