'use strict';
const $ = id => document.getElementById(id);
const canvas = $('ink'), ctx = canvas.getContext('2d');
let strokes = [], current = null, pointer = null, erasing = false, busy = false, worker = null, selected = null;
const storageKey = 'handwriting-memo:v1';
let memos = [], storageReadable = true;
try {
 const raw = localStorage.getItem(storageKey);
 const parsed = raw ? JSON.parse(raw) : [];
 if (!Array.isArray(parsed) || parsed.some(m => !m || typeof m.id !== 'string' || typeof m.text !== 'string' || typeof m.date !== 'string')) throw new Error('Invalid notes');
 memos = parsed;
} catch { storageReadable = false; $('save-status').textContent = '保存データを読み込めません。既存データを守るため保存を停止しています。ブラウザの設定を確認してください。'; }
function drawStroke(target, stroke) {
 target.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
 target.strokeStyle = '#172a23'; target.fillStyle = '#172a23'; target.lineWidth = stroke.erase ? 38 : 6;
 target.lineCap = 'round'; target.lineJoin = 'round';
 target.beginPath(); const [first,...rest] = stroke.points;
 target.moveTo(first.x,first.y);
 if (!rest.length) { target.arc(first.x, first.y, target.lineWidth/2,0,Math.PI*2); target.fill(); }
 else { for (const p of rest) target.lineTo(p.x,p.y); target.stroke(); }
 target.globalCompositeOperation = 'source-over';
}
function renderInk() {
 ctx.clearRect(0,0,900,900); strokes.forEach(s => drawStroke(ctx,s)); if (current) drawStroke(ctx,current);
 $('canvas-hint').hidden = strokes.length > 0 || !!current;
 $('undo').disabled = busy || strokes.length === 0;
}
function point(event) { const r=canvas.getBoundingClientRect(); return {x:(event.clientX-r.left)*900/r.width,y:(event.clientY-r.top)*900/r.height}; }
canvas.addEventListener('pointerdown', event => {
 if (busy || pointer !== null || (event.pointerType==='mouse' && event.button!==0)) return;
 event.preventDefault(); pointer=event.pointerId; canvas.setPointerCapture(pointer);
 current={erase:erasing,points:[point(event)]}; renderInk();
});
canvas.addEventListener('pointermove', event => {
 if (event.pointerId !== pointer || !current) return;
 event.preventDefault(); const events=event.getCoalescedEvents?.() || []; (events.length ? events : [event]).forEach(e=>current.points.push(point(e))); renderInk();
});
function finish(event) { if (event.pointerId!==pointer || !current) return; strokes.push(current); current=null; pointer=null; renderInk(); }
canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
$('undo').onclick=()=>{strokes.pop();renderInk();};
$('eraser').onclick=()=>{erasing=!erasing;$('eraser').setAttribute('aria-pressed',String(erasing));};
$('clear').onclick=()=>{if(strokes.length && confirm('手書きエリアをすべて消しますか？')){strokes=[];renderInk();}};
function recognitionImage() {
 const {data}=ctx.getImageData(0,0,900,900); let left=900,top=900,right=-1,bottom=-1;
 for(let y=0;y<900;y++) for(let x=0;x<900;x++) if(data[(y*900+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)return null;
 const image=document.createElement('canvas');image.width=right-left+81;image.height=bottom-top+81;
 const c=image.getContext('2d');c.fillStyle='white';c.fillRect(0,0,image.width,image.height);c.drawImage(canvas,left,top,right-left+1,bottom-top+1,40,40,right-left+1,bottom-top+1);return image;
}
function setBusy(value){busy=value;for(const id of ['convert','eraser','clear','save'])$(id).disabled=value;$('text').readOnly=value;renderInk();$('convert').textContent=value?'認識しています…':'文字に変換 →';}
$('convert').onclick=async()=>{
 if(current || busy)return;
 const image=recognitionImage();if(!image){$('ocr-status').textContent='まず手書きエリアに文字を書いてください。';return;}
 if($('text').value.trim() && !confirm('入力中の本文を認識結果で置き換えますか？'))return;
 setBusy(true);$('ocr-status').textContent='日本語の認識データを準備しています…';
 try {
  if(!window.Tesseract)throw new Error('OCR library unavailable');
  if(!worker){const base=new URL('./vendor/',location.href);worker=await Tesseract.createWorker('jpn',1,{
   workerPath:new URL('worker.min.js',base).href,corePath:new URL('core/',base).href,langPath:new URL('lang/',base).href,workerBlobURL:false,
   logger:message=>{if(message.status==='recognizing text')$('ocr-status').textContent=`文字を読み取っています… ${Math.round(message.progress*100)}%`;},
  });await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});}
  const result=await worker.recognize(image);const text=result.data.text.trim();
  if(!text){$('ocr-status').textContent='文字を読み取れませんでした。横書きで、文字を離して大きく書くか、本文を直接入力してください。';return;}
  $('text').value=text;$('ocr-status').textContent='変換しました。誤字を確認してから保存してください。';
 }catch(error){console.error('OCR failed',error);if(worker){await worker.terminate().catch(()=>{});worker=null;}$('ocr-status').textContent='認識に失敗しました。初回は通信が必要です。通信状態や端末の空きメモリを確認し、もう一度お試しください。本文の直接入力もできます。';}
 finally{setBusy(false);}
};
const formatDate = date => new Date(date).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
function persist(next){if(!storageReadable)return false;try{localStorage.setItem(storageKey,JSON.stringify(next));memos=next;return true;}catch{$('save-status').textContent='保存できませんでした。端末の空き容量やブラウザの保存設定を確認してください。本文はそのまま残しています。';return false;}}
function renderMemos(){const list=$('memo-list');list.replaceChildren();$('memo-count').textContent=`${memos.length}件`;
 if(!memos.length){const p=document.createElement('p');p.className='empty';p.textContent='まだメモはありません。最初のひとことを残しましょう。';list.append(p);}
 for(const memo of memos){const b=document.createElement('button');b.className='memo-card';b.type='button';const time=document.createElement('time');time.dateTime=memo.date;time.textContent=formatDate(memo.date);const p=document.createElement('p');p.textContent=memo.text;b.append(time,p);b.onclick=()=>{selected=memo.id;$('detail-date').textContent=formatDate(memo.date);$('detail-text').textContent=memo.text;$('memo-dialog').showModal();};list.append(b);}
}
$('save').onclick=()=>{const text=$('text').value.trim();if(!text){$('save-status').textContent='保存する本文を入力してください。';return;}const memo={id:crypto.randomUUID(),text,date:new Date().toISOString()};if(persist([memo,...memos])){$('text').value='';strokes=[];renderInk();renderMemos();$('save-status').textContent='この端末に保存しました。';$('ocr-status').textContent='';}};
$('close-dialog').onclick=()=>$('memo-dialog').close();
$('delete-memo').onclick=()=>{if(confirm('このメモを削除しますか？この操作は元に戻せません。') && persist(memos.filter(m=>m.id!==selected))){$('memo-dialog').close();renderMemos();$('save-status').textContent='メモを削除しました。';}};
renderInk();renderMemos();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>$('offline-status').textContent='ホーム画面への追加に対応しています。').catch(()=>$('offline-status').textContent='オフライン機能を準備できませんでした。通信中は利用できます。');}
