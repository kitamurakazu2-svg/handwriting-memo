const {test,expect}=require('@playwright/test');
const inkPixels=page=>page.locator('#ink').evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return data.reduce((sum,v,i)=>i%4===3?sum+v:sum,0);});
async function drawTouch(page,session){
 await page.locator('#ink').scrollIntoViewIfNeeded();
 const r=await page.locator('#ink').boundingBox();
 // Generate a continuous, trusted touch gesture; touch-action:none keeps it on the canvas.
 await session.send('Input.synthesizeScrollGesture',{x:r.x+50,y:r.y+50,xDistance:-80,yDistance:0,speed:200,gestureSourceType:'touch',preventFling:true});
 await expect(page.locator('#undo')).toBeEnabled();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
for(const viewport of [{width:390,height:844},{width:412,height:915}])test.describe(`smartphone touch drawing and clearing (${viewport.width}px)`,()=>{
 test.use({hasTouch:true,isMobile:true,viewport});
 test('消去 asks confirmation; cancel keeps ink; OK clears ink and preserves notes',async({page,context})=>{
  await page.goto('./');await page.locator('#text').fill('保存したメモ');await page.locator('#save').tap();
  await page.locator('#text').fill('編集途中の本文');
  const session=await context.newCDPSession(page);const pointerTypes=[];
  await page.exposeFunction('recordPointer',type=>pointerTypes.push(type));
  await page.locator('#ink').evaluate(c=>c.addEventListener('pointerdown',e=>window.recordPointer(e.pointerType)));
  await drawTouch(page,session);const drawn=await inkPixels(page);expect(drawn).toBeGreaterThan(0);expect(pointerTypes).toContain('touch');
  let confirmations=0;
  page.once('dialog',async d=>{confirmations++;expect(d.type()).toBe('confirm');expect(d.message()).toContain('手書き内容をすべて消去');await d.dismiss();});
  await page.getByRole('button',{name:'消去',exact:true}).tap();await expect(page.locator('#ink-status')).toContainText('キャンセル');expect(confirmations).toBe(1);expect(await inkPixels(page)).toBe(drawn);
  await page.getByRole('button',{name:'消しゴム',exact:true}).tap();await expect(page.locator('#eraser')).toHaveAttribute('aria-pressed','true');
  page.once('dialog',async d=>{confirmations++;await d.accept();});await page.getByRole('button',{name:'消去',exact:true}).tap();
  await expect(page.locator('#ink-status')).toHaveText('手書きを消去しました。');expect(confirmations).toBe(2);expect(await inkPixels(page)).toBe(0);await expect(page.locator('#canvas-hint')).toBeVisible();
  await expect(page.locator('#eraser')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#ink-status')).toHaveText('手書きを消去しました。');await expect(page.locator('#text')).toHaveValue('編集途中の本文');
  await expect(page.locator('#memo-count')).toHaveText('1件');await page.locator('.memo-card').tap();await expect(page.locator('#detail-text')).toHaveText('保存したメモ');await page.locator('#close-dialog').tap();
  await drawTouch(page,session);expect(await inkPixels(page)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test('eraser visibly switches modes and erases touch strokes; undo restores them',async({page,context})=>{
  await page.goto('./');const session=await context.newCDPSession(page);await drawTouch(page,session);const drawn=await inkPixels(page);
  await page.getByRole('button',{name:'消しゴム',exact:true}).tap();await expect(page.locator('#ink-status')).toContainText('なぞって');
  await drawTouch(page,session);expect(await inkPixels(page)).toBeLessThan(drawn);await page.locator('#undo').tap();expect(await inkPixels(page)).toBe(drawn);
  await page.locator('#eraser').tap();await expect(page.locator('#eraser')).toHaveAttribute('aria-pressed','false');
 });
 test('empty handwriting reports no content without asking confirmation',async({page})=>{
  await page.goto('./');const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await page.getByRole('button',{name:'消去',exact:true}).tap();await expect(page.locator('#ink-status')).toHaveText('消去する手書きはありません。');expect(dialogs).toEqual([]);
 });
});
test('clearing a captured in-progress pen stroke does not restore it on pointerup',async({page})=>{
 await page.goto('./');const r=await page.locator('#ink').boundingBox();
 await page.mouse.move(r.x+40,r.y+40);await page.mouse.down();await page.mouse.move(r.x+120,r.y+40);expect(await inkPixels(page)).toBeGreaterThan(0);
 page.once('dialog',d=>d.accept());await page.locator('#clear').evaluate(b=>b.click());await page.mouse.up();
 expect(await inkPixels(page)).toBe(0);await expect(page.locator('#undo')).toBeDisabled();
 await page.mouse.move(r.x+40,r.y+80);await page.mouse.down();await page.mouse.move(r.x+120,r.y+80);await page.mouse.up();expect(await inkPixels(page)).toBeGreaterThan(0);
});
