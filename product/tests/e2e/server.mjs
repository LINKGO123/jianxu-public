import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
// The isolated instance cannot fall back to a real provider if a page mock is missing.
dns.lookup=async()=>{throw new Error('E2E_UNMOCKED_EXTERNAL_DNS');};
https.request=()=>{throw new Error('E2E_UNMOCKED_EXTERNAL_HTTPS');};
globalThis.fetch=async()=>{throw new Error('E2E_UNMOCKED_EXTERNAL_FETCH');};
syncBuiltinESMExports();
const root=resolve(process.env.JIANXU_E2E_RUN||'../output/testing/RUN-20261029-002');
const {buildApp}=await import(pathToFileURL(resolve(root,'runtime/server/app.js')));
const app=await buildApp(true);
await app.listen({host:'127.0.0.1',port:5173});
console.log('Isolated production build on 127.0.0.1:5173; outgoing provider transports blocked.');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
