import { mkdir, copyFile, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const out = new URL('../dist/', import.meta.url);
await mkdir(out, { recursive: true });
for (const file of ['index.html','style.css','app.js','sw.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png']) await copyFile(new URL('../'+file, import.meta.url), new URL(file,out));
await rm(new URL('vendor/core/',out),{recursive:true,force:true});
await mkdir(new URL('vendor/core/',out),{recursive:true});
await mkdir(new URL('vendor/lang/',out),{recursive:true});
for (const file of ['tesseract.min.js','worker.min.js']) await copyFile(`node_modules/tesseract.js/dist/${file}`, new URL('vendor/'+file,out));
for (const file of await readdir('node_modules/tesseract.js-core')) if (file.endsWith('.wasm') || file.endsWith('.wasm.js')) await copyFile('node_modules/tesseract.js-core/'+file,new URL('vendor/core/'+file,out));
const modelUrl='https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/jpn.traineddata';
const modelFile=new URL('vendor/lang/jpn.traineddata.gz',out);
let data;
try { const {gunzipSync}=await import('node:zlib'); data=gunzipSync(await readFile(modelFile)); } catch {
 data=execFileSync('curl',['--fail','--location','--silent','--show-error',modelUrl],{maxBuffer:24*1024*1024});
}
if (createHash('sha256').update(data).digest('hex')!=='36bdf9ac823f5911e624c30d0553e890b8abc7c31a65b3ef14da943658c40b79') throw new Error('Japanese model checksum mismatch');
await writeFile(modelFile,gzipSync(data));
await copyFile('node_modules/tesseract.js/LICENSE.md',new URL('vendor/TESSERACT-LICENSE',out));
await copyFile('node_modules/tesseract.js-core/LICENSE',new URL('vendor/CORE-LICENSE',out));
await writeFile(new URL('vendor/MODEL-LICENSE.txt',out),'Japanese tessdata_best model: Apache-2.0. Source: '+modelUrl+'\nSee TESSERACT-LICENSE for license text.\n');
console.log('Static site built in dist (Japanese model checksum verified).');
