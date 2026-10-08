import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Tesseract.js 6.0.1 swallows loadLanguage/initialize failures in createWorker.
// Bundle its source with a checked patch: reject initialization and pending jobs,
// release the native Worker, and let an AbortSignal stop a stalled startup.
// Fail the build if the pinned source changes; never patch minified variable names.
export async function bundleOCR(outfile) {
 await build({
  entryPoints: ['node_modules/tesseract.js/src/index.js'], outfile,
  bundle: true, platform: 'browser', format: 'iife', globalName: 'Tesseract',
  minify: true, target: ['es2020'],
  plugins: [{ name: 'tesseract-worker-failure', setup(build) {
   build.onLoad({ filter: /[/\\]tesseract\.js[/\\]src[/\\]createWorker\.js$/ }, async ({path}) => {
    let source = await readFile(path, 'utf8');
    const replace = (before, after) => {
     if (source.split(before).length !== 2) throw new Error('Tesseract 6.0.1 patch no longer matches: '+before);
     source = source.replace(before, after);
    };
    replace('    logger,\n    errorHandler,', '    logger,\n    errorHandler,\n    signal,');
    replace('  const promises = {};', `  if (signal?.aborted) throw new Error('OCR startup aborted');
  const promises = {};`);
    replace('  const workerError = (event) => { workerResReject(event.message); };', `  const fail = (error) => {
    workerResReject(error);
    for (const key of Object.keys(promises)) {
      promises[key].reject(error);
      delete promises[key];
    }
    signal?.removeEventListener('abort', abort);
    if (worker !== null) { terminateWorker(worker); worker = null; }
    if (errorHandler) errorHandler(error);
  };
  const abort = () => fail(new Error('OCR startup aborted'));
  const workerError = (event) => fail(event.message || 'OCR Worker error');`);
    replace('  worker.onerror = workerError;', `  worker.onerror = workerError;
  signal?.addEventListener('abort', abort, { once: true });`);
    replace('  const terminate = async () => {', `  const terminate = async () => {
    signal?.removeEventListener('abort', abort);`);
    replace(`      promises[promiseId].reject(data);
      delete promises[promiseId];
      if (action === 'load') workerResReject(data);
      if (errorHandler) {
        errorHandler(data);
      } else {
        throw Error(data);
      }`, '      fail(data);');
    replace('    .catch(() => {});', '    .catch(fail);');
    return { contents: source, loader: 'js' };
   });
  }}],
 });
}
