const {test,expect}=require('@playwright/test');
test('mobile drawing, eraser, undo and clear',async({page})=>{
 await page.goto('./');const canvas=page.locator('#ink');const box=await canvas.boundingBox();
 const draw=async()=>{await page.mouse.move(box.x+50,box.y+50);await page.mouse.down();await page.mouse.move(box.x+150,box.y+50,{steps:10});await page.mouse.up();};
 const alpha=()=>canvas.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,900,900).data;return d.filter((_,i)=>i%4===3).reduce((a,b)=>a+b,0);});
 await draw();const drawn=await alpha();expect(drawn).toBeGreaterThan(0);
 await page.locator('#eraser').click();await draw();expect(await alpha()).toBeLessThan(drawn);
 await page.locator('#undo').click();expect(await alpha()).toBe(drawn);
 await page.locator('#undo').click();expect(await alpha()).toBe(0);
 await page.locator('#eraser').click();await draw();expect(await alpha()).toBeGreaterThan(0);page.once('dialog',d=>d.accept());await page.locator('#clear').click();expect(await alpha()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('save text safely, reload, show full note, delete',async({page})=>{
 await page.goto('./');await page.locator('#save').click();await expect(page.locator('#save-status')).toContainText('本文');
 const text='買い物メモ\n牛乳とパン <img src=x onerror=alert(1)>';await page.locator('#text').fill(text);await page.locator('#save').click();
 await expect(page.locator('#memo-count')).toHaveText('1件');await page.reload();await page.locator('.memo-card').click();await expect(page.locator('#detail-text')).toHaveText(text);await expect(page.locator('#detail-date')).not.toBeEmpty();expect(await page.locator('#detail-text img').count()).toBe(0);
 page.once('dialog',d=>d.accept());await page.locator('#delete-memo').click();await expect(page.locator('#memo-count')).toHaveText('0件');await page.reload();await expect(page.locator('#memo-count')).toHaveText('0件');
});
test('Japanese OCR really runs locally, then works offline',async({page,context})=>{
 const outside=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('blob:'))outside.push(r.url());});
 await page.goto('./');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 // Printed control fixture validates engine/model loading, not handwriting accuracy.
 await page.locator('#ink').evaluate(async c=>{await document.fonts.ready;const ctx=c.getContext('2d');ctx.fillStyle='#172a23';ctx.font='72px sans-serif';ctx.fillText('日本語のメモ',70,130);});
 await page.locator('#convert').click();await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});await expect(page.locator('#text')).toHaveValue(/日本語/);expect(outside).toEqual([]);
 await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toContainText('手書きメモ');await page.locator('#text').fill('オフラインのメモ');await page.locator('#save').click();await expect(page.locator('#memo-count')).toHaveText('1件');
 await page.locator('#ink').evaluate(c=>{const ctx=c.getContext('2d');ctx.fillStyle='#172a23';ctx.font='72px sans-serif';ctx.fillText('日本語のメモ',70,130);});await page.locator('#convert').click();await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});await expect(page.locator('#text')).toHaveValue(/日本語/);
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
test('storage failure keeps unsaved text',async({page})=>{
 await page.goto('./');await page.evaluate(()=>Storage.prototype.setItem=()=>{throw new Error('quota');});await page.locator('#text').fill('消えてはいけない本文');await page.locator('#save').click();await expect(page.locator('#text')).toHaveValue('消えてはいけない本文');await expect(page.locator('#save-status')).toContainText('保存できません');
});
test('finger pointer strokes remain through resize and cancel',async({page})=>{
 await page.goto('./');const ink=page.locator('#ink');const r=await ink.boundingBox();
 // Real pointer handling with touch identity; capture is provided by an actual down event.
 await page.evaluate(({x,y})=>{const c=document.getElementById('ink');c.setPointerCapture=()=>{};c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:31,pointerType:'touch',clientX:x+30,clientY:y+30,bubbles:true}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:31,pointerType:'touch',clientX:x+100,clientY:y+60,bubbles:true}));c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:31,pointerType:'touch',bubbles:true}));},{x:r.x,y:r.y});
 const pixels=()=>ink.evaluate(c=>c.getContext('2d').getImageData(0,0,900,900).data.some((v,i)=>i%4===3&&v>0));expect(await pixels()).toBe(true);await page.setViewportSize({width:320,height:700});expect(await pixels()).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#undo').click();expect(await pixels()).toBe(false);
});
test('stroke-only Japanese sample passes through canvas OCR',async({page})=>{
 await page.goto('./');const r=await page.locator('#ink').boundingBox();
 // Manually defined uneven pen paths for 日本, not font-rendered text.
 // This is one controlled sample, not a general handwriting accuracy benchmark.
 const strokes=[[[100,100],[98,300]],[[100,100],[220,103],[217,298]],[[100,201],[218,198]],[[100,300],[217,298]],[[290,150],[446,148]],[[369,80],[365,310]],[[365,150],[328,220],[283,264]],[[366,150],[398,221],[445,265]],[[321,261],[408,258]]];
 for(const stroke of strokes){await page.mouse.move(r.x+stroke[0][0]/900*r.width,r.y+stroke[0][1]/900*r.height);await page.mouse.down();for(const [x,y] of stroke.slice(1))await page.mouse.move(r.x+x/900*r.width,r.y+y/900*r.height,{steps:8});await page.mouse.up();}
 await page.locator('#convert').click();await expect(page.locator('#ocr-status')).toContainText('変換しました',{timeout:150000});await expect(page.locator('#text')).toHaveValue('日本');
});
test('updated service worker removes obsolete OCR cache and keeps saved notes',async({page})=>{
 await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.locator('#text').fill('更新後も残すメモ');await page.locator('#save').click();
 await page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.getRegistration();await registration.unregister();
  const old=await caches.open('handwriting-memo-v1');await old.put('./app.js',new Response('obsolete OCR code'));
  await caches.open('unrelated-app-cache');
 });
 await page.reload();await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(async()=>!(await caches.keys()).includes('handwriting-memo-v1'))).toBe(true);
 expect(await page.evaluate(()=>caches.keys())).toContain('unrelated-app-cache');
 await expect(page.locator('#memo-count')).toHaveText('1件');await page.locator('.memo-card').click();
 await expect(page.locator('#detail-text')).toHaveText('更新後も残すメモ');
});
