const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
async function prepare(page, path='./') {
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;window.activeOCRWorkers=0;
  window.Worker=class extends NativeWorker {
   constructor(...args){super(...args);window.activeOCRWorkers++;this.stopped=false;}
   terminate(){if(!this.stopped){window.activeOCRWorkers--;this.stopped=true;}return super.terminate();}
  };
 });
 await page.goto(path);
 await page.locator('#ink').evaluate(c=>{const x=c.getContext('2d');x.fillStyle='#172a23';x.font='72px sans-serif';x.fillText('日本語のメモ',70,130);});
 await page.locator('#text').fill('入力中の本文');
}
async function convert(page){page.once('dialog',d=>d.accept());await page.locator('#convert').click();}
async function failure(page,expected){
 await expect(page.locator('#ocr-status')).toContainText('認識に失敗しました',{timeout:15000});
 await expect(page.locator('#ocr-status')).toContainText(expected);
 await expect(page.locator('#text')).toHaveValue('入力中の本文');
 await expect(page.locator('#convert')).toBeEnabled();
 expect(await page.evaluate(()=>window.activeOCRWorkers)).toBe(0);
}
test('confirmation OK starts real Japanese OCR and preserves text until completion',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/jpn.traineddata.gz',async r=>{await gate;await r.continue();});
 await prepare(page,'./index.html?from=home');await convert(page);
 await expect(page.locator('#ocr-status')).toContainText('日本語の認識データを読み込んでいます');
 await expect(page.locator('#ocr-progress')).toBeVisible();await expect(page.locator('#convert')).toBeDisabled();
 await expect(page.locator('#text')).toHaveValue('入力中の本文');
 release();await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});
 await expect(page.locator('#text')).toHaveValue(/日本語/);
 expect(requests.filter(u=>u.includes('/vendor/')).every(u=>u.startsWith('http://127.0.0.1:4173/handwriting-memo/vendor/'))).toBe(true);
 for(const name of ['tesseract.min.js','worker.min.js','jpn.traineddata.gz'])expect(requests.some(u=>u.endsWith('/'+name))).toBe(true);
 expect(await page.evaluate(()=>window.activeOCRWorkers)).toBe(0);
});
test('cancel confirmation leaves text and never loads OCR',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));await prepare(page);
 page.once('dialog',d=>d.dismiss());await page.locator('#convert').click();
 await expect(page.locator('#text')).toHaveValue('入力中の本文');await expect(page.locator('#convert')).toBeEnabled();
 expect(requests.some(u=>u.includes('/vendor/'))).toBe(false);
});
for(const [name,pattern,expected] of [
 ['library','**/vendor/tesseract.min.js','Tesseract.jsを読み込めません'],
 ['worker','**/vendor/worker.min.js','Worker'],
 ['core','**/vendor/core/*.wasm.js','認識エンジン'],
 ['Japanese model','**/jpn.traineddata.gz','404'],
])test(`${name} 404 is visible and retry succeeds`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(pattern,r=>r.fulfill({status:404,body:'missing OCR asset'}));
 await prepare(page);await convert(page);await failure(page,expected);
 expect(errors).toEqual([]);
 await page.unroute(pattern);await convert(page);
 await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});await expect(page.locator('#text')).toHaveValue(/日本語/);
 expect(await page.evaluate(()=>window.activeOCRWorkers)).toBe(0);
});
test('corrupted Japanese model fails initialization without hanging',async({page})=>{
 await page.route('**/jpn.traineddata.gz',r=>r.fulfill({status:200,contentType:'application/octet-stream',body:'invalid gzip/model'}));
 await prepare(page);await convert(page);await failure(page,'エラー:');
});
test('stalled startup times out, releases Worker and permits retry',async({page})=>{
 let pending;await page.route('**/jpn.traineddata.gz',r=>{pending=r;});
 await prepare(page);await page.clock.install();await convert(page);
 await expect(page.locator('#ocr-status')).toContainText('日本語の認識データを読み込んでいます');
 // Worker progress arrives before the asynchronous cache lookup starts fetch.
 // Wait for the intercepted request before advancing the main-page clock.
 await expect.poll(()=>Boolean(pending)).toBe(true);
 await page.clock.fastForward(180001);await failure(page,'180秒');
 await pending.abort();await page.unroute('**/jpn.traineddata.gz');await page.clock.resume();await convert(page);
 await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});
});
test('empty recognition and recognition error both preserve existing text',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:'  '}}),terminate:async()=>{}})};});
 await convert(page);await expect(page.locator('#ocr-status')).toContainText('認識は完了しましたが');await expect(page.locator('#text')).toHaveValue('入力中の本文');
 await page.evaluate(()=>{window.Tesseract.createWorker=async()=>({setParameters:async()=>{},recognize:async()=>{throw new Error('WASM memory failure');},terminate:async()=>{}});});
 await convert(page);await failure(page,'WASM memory failure');
});
test('native Worker crash during recognition rejects pending job',async({page})=>{
 await prepare(page);await page.addScriptTag({url:'./vendor/tesseract.min.js'});
 await page.evaluate(()=>{
  const create=window.Tesseract.createWorker;
  window.Tesseract.createWorker=async(...args)=>{
   const worker=await create(...args);worker.recognize=()=>{
    const pending=worker.setParameters({tessedit_pageseg_mode:'6'});
    worker.worker.dispatchEvent(new ErrorEvent('error',{message:'Worker crashed during recognition'}));return pending;
   };return worker;
  };
 });
 await convert(page);await failure(page,'Worker crashed during recognition');
});
test('valid gzip with invalid traineddata reports initialization failure',async({page})=>{
 const {gzipSync}=require('node:zlib');
 await page.route('**/jpn.traineddata.gz',r=>r.fulfill({status:200,contentType:'application/octet-stream',body:gzipSync(Buffer.from('invalid traineddata'))}));
 await prepare(page);await convert(page);await failure(page,'エラー:');
});
test('Japanese OCR also works on devices without WebAssembly SIMD',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.route('**/vendor/worker.min.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:'WebAssembly.validate=()=>false;\n'+await response.text()});
 });
 await prepare(page);await convert(page);
 await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});await expect(page.locator('#text')).toHaveValue(/日本語/);
 expect(requests.some(u=>u.endsWith('/tesseract-core-lstm.wasm.js'))).toBe(true);
});
