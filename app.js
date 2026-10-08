'use strict';
const $ = id => document.getElementById(id);
const canvas = $('ink'), ctx = canvas.getContext('2d');
let strokes = [], current = null, pointer = null, erasing = false, busy = false, selected = null;
const appBase = new URL('./', document.currentScript.src);
const OCR_TIMEOUT_MS = 180000;
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
 current={erase:erasing,points:[point(event)]};$('ink-status').textContent='';renderInk();
});
canvas.addEventListener('pointermove', event => {
 if (event.pointerId !== pointer || !current) return;
 event.preventDefault(); const events=event.getCoalescedEvents?.() || []; (events.length ? events : [event]).forEach(e=>current.points.push(point(e))); renderInk();
});
function finish(event) { if (event.pointerId!==pointer || !current) return; strokes.push(current); current=null; pointer=null; renderInk(); }
canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish); canvas.addEventListener('lostpointercapture', finish);
$('undo').onclick=()=>{strokes.pop();renderInk();};
function setEraser(value){erasing=value;$('eraser').setAttribute('aria-pressed',String(value));$('eraser').textContent=value?'消しゴム ON':'消しゴム';}
$('eraser').onclick=()=>{if(busy)return;setEraser(!erasing);$('ink-status').textContent=erasing?'消したい部分を指やペンでなぞってください。':'ペンに戻しました。';};
$('clear').onclick=()=>{
 if(busy)return;
 if(!strokes.length && !current){$('ink-status').textContent='消去する手書きはありません。';return;}
 if(!confirm('手書き内容をすべて消去しますか？本文と保存したメモは消えません。')){$('ink-status').textContent='消去をキャンセルしました。';return;}
 const capturedPointer=pointer;strokes=[];current=null;pointer=null;
 if(capturedPointer!==null && canvas.hasPointerCapture(capturedPointer))canvas.releasePointerCapture(capturedPointer);
 setEraser(false);renderInk();$('ink-status').textContent='手書きを消去しました。';
};
function recognitionImage() {
 const {data}=ctx.getImageData(0,0,900,900); let left=900,top=900,right=-1,bottom=-1;
 for(let y=0;y<900;y++) for(let x=0;x<900;x++) if(data[(y*900+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<0)return null;
 const image=document.createElement('canvas');image.width=right-left+81;image.height=bottom-top+81;
 const c=image.getContext('2d');c.fillStyle='white';c.fillRect(0,0,image.width,image.height);c.drawImage(canvas,left,top,right-left+1,bottom-top+1,40,40,right-left+1,bottom-top+1);return image;
}
function setBusy(value){busy=value;for(const id of ['convert','eraser','clear','save'])$(id).disabled=value;$('text').readOnly=value;canvas.setAttribute('aria-busy',String(value));$('undo').disabled=value || strokes.length===0;$('convert').textContent=value?'認識しています…':'文字に変換 →';}
function loadOCRLibrary(signal) {
 if(typeof window.Tesseract?.createWorker === 'function')return Promise.resolve();
 const url=new URL('vendor/tesseract.min.js',appBase).href;
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=url;
  const finish=error=>{signal.removeEventListener('abort',abort);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
  const abort=()=>finish(new Error('OCRライブラリの読み込みを中断しました。'));
  script.onload=()=>finish(typeof window.Tesseract?.createWorker === 'function'?null:new Error(`Tesseract.jsの初期化に失敗しました: ${url}`));
  script.onerror=()=>finish(new Error(`Tesseract.jsを読み込めません: ${url}`));
  if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});document.head.append(script);
 });
}
$('convert').onclick=async()=>{
 if(current || busy)return;
 let image;
 try{image=recognitionImage();}catch(error){$('ocr-status').textContent=`認識用の画像を準備できません: ${error.message || String(error)}`;return;}
 if(!image){$('ocr-status').textContent='まず手書きエリアに文字を書いてください。';return;}
 if($('text').value.trim() && !confirm('入力中の本文を認識結果で置き換えますか？'))return;
 setBusy(true);
 let worker=null;
 const controller=new AbortController();
 const started=Date.now();let stage='OCRライブラリを読み込んでいます';
 const showProgress=(label,progress)=>{
  stage=label;$('ocr-status').textContent=label+'…';$('ocr-progress').hidden=false;
  if(Number.isFinite(progress)){$('ocr-progress').value=Math.round(Math.max(0,Math.min(1,progress))*100);$('ocr-status').textContent+=` ${$('ocr-progress').value}%`;}
  else $('ocr-progress').removeAttribute('value');
 };
 const labels={
  'loading tesseract core':'認識エンジンを読み込んでいます',
  'initializing tesseract':'認識エンジンを初期化しています',
  'loading language traineddata':'日本語の認識データを読み込んでいます',
  'initializing api':'日本語の認識データを初期化しています',
  'recognizing text':'文字を読み取っています',
 };
 let timeout;
 const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{
  reject(new Error('認識が180秒以内に完了しませんでした。通信状態や端末の空きメモリを確認して再試行してください。'));
  controller.abort();
 },OCR_TIMEOUT_MS);});
 $('ocr-elapsed').hidden=false;$('ocr-elapsed').textContent='開始から 0秒（最大180秒）';
 const ticker=setInterval(()=>$('ocr-elapsed').textContent=`開始から ${Math.floor((Date.now()-started)/1000)}秒（最大180秒）`,1000);
 showProgress(stage);
 try {
  const recognize=async()=>{
   await loadOCRLibrary(controller.signal);
   showProgress('認識Workerを起動しています');
   const base=new URL('vendor/',appBase);
   worker=await Tesseract.createWorker('jpn',1,{
    workerPath:new URL('worker.min.js',base).href,corePath:new URL('core/',base).href,langPath:new URL('lang/',base).href,
    workerBlobURL:false,gzip:true,signal:controller.signal,
    logger:message=>{if(!controller.signal.aborted)showProgress(labels[message.status] || '認識を準備しています',message.progress);},
    errorHandler:error=>console.error('OCR Worker failed',error),
   });
   if(controller.signal.aborted){await worker.terminate();worker=null;throw new Error('認識を中断しました。');}
   await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
   showProgress('文字を読み取っています',0);
   return worker.recognize(image);
  };
  const result=await Promise.race([recognize(),deadline]);const text=result.data.text.trim();
  if(!text){$('ocr-progress').hidden=true;$('ocr-status').textContent='認識は完了しましたが、文字を読み取れませんでした。横書きで、文字を離して大きく書くか、本文を直接入力してください。本文は変更していません。';return;}
  $('text').value=text;$('ocr-progress').value=100;$('ocr-status').textContent='変換しました。誤字を確認してから保存してください。';
 }catch(error){
  console.error('OCR failed',stage,error);$('ocr-progress').hidden=true;
  const detail=error?.message || String(error);
  $('ocr-status').textContent=`認識に失敗しました（${stage}）。エラー: ${detail} 本文は変更していません。初回は通信が必要です。通信状態を確認して「文字に変換」で再試行してください。`;
 }finally{
  clearTimeout(timeout);clearInterval(ticker);
  if(worker){await worker.terminate().catch(()=>{});worker=null;}
  controller.abort();
  $('ocr-elapsed').textContent=`処理時間 ${Math.floor((Date.now()-started)/1000)}秒`;setBusy(false);
 }
};
const formatDate = date => new Date(date).toLocaleString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
function persist(next){if(!storageReadable)return false;try{localStorage.setItem(storageKey,JSON.stringify(next));memos=next;return true;}catch{$('save-status').textContent='保存できませんでした。端末の空き容量やブラウザの保存設定を確認してください。本文はそのまま残しています。';return false;}}
function renderMemos(){const list=$('memo-list');list.replaceChildren();$('memo-count').textContent=`${memos.length}件`;
 if(!memos.length){const p=document.createElement('p');p.className='empty';p.textContent='まだメモはありません。最初のひとことを残しましょう。';list.append(p);}
 for(const memo of memos){const b=document.createElement('button');b.className='memo-card';b.type='button';const time=document.createElement('time');time.dateTime=memo.date;time.textContent=formatDate(memo.date);const p=document.createElement('p');p.textContent=memo.text;b.append(time,p);b.onclick=()=>{selected=memo.id;$('detail-date').textContent=formatDate(memo.date);$('detail-text').textContent=memo.text;$('memo-dialog').showModal();};list.append(b);}
}
$('save').onclick=()=>{const text=$('text').value.trim();if(!text){$('save-status').textContent='保存する本文を入力してください。';return;}const memo={id:crypto.randomUUID(),text,date:new Date().toISOString()};if(persist([memo,...memos])){$('text').value='';strokes=[];renderInk();renderMemos();$('save-status').textContent='この端末に保存しました。';$('ocr-status').textContent='';$('ocr-progress').hidden=true;$('ocr-elapsed').hidden=true;}};
$('close-dialog').onclick=()=>$('memo-dialog').close();
$('delete-memo').onclick=()=>{if(confirm('このメモを削除しますか？この操作は元に戻せません。') && persist(memos.filter(m=>m.id!==selected))){$('memo-dialog').close();renderMemos();$('save-status').textContent='メモを削除しました。';}};
renderInk();renderMemos();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>$('offline-status').textContent='ホーム画面への追加に対応しています。').catch(()=>$('offline-status').textContent='オフライン機能を準備できませんでした。通信中は利用できます。');}
