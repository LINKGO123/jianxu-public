import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.JIANXU_CHECK_ROOT?pathToFileURL(resolve(process.env.JIANXU_CHECK_ROOT)+'/'):new URL('../dist/',import.meta.url);
const {buildApp}=await import(new URL('server/app.js',root));
const {normalizeImage}=await import(new URL('server/image-codec.js',root));
const app=await buildApp(true);
try {
  const paths=['/','/workbench/','/home/boot.js','/home/app.js','/home/sky-scene.js','/home/liquid-nav.js','/home/styles.css','/home/sky-scene.css','/home/liquid-nav.css','/shared/brand.css','/home/assets/sky-mirror-aged-chair.png','/vendor/pdfjs/LICENSE','/vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap','/vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',...['editorial','atelier','grid','nordic','developer','tokyo'].map(id=>`/examples/${id}.png`)];
  for(const url of paths){const response=await app.inject({url,headers:{host:'127.0.0.1:4173'}});assert.equal(response.statusCode,200,url);}
  const bundles=readdirSync(new URL('client/assets/',root)).filter(name=>/\.(m?js|css)$/.test(name));
  for(const name of bundles){const url='/assets/'+name;const response=await app.inject({url,headers:{host:'127.0.0.1:4173'}});assert.equal(response.statusCode,200,url);}
  assert.equal((await app.inject({url:'/client/storage.ts',headers:{host:'127.0.0.1:4173'}})).statusCode,404);
  assert.equal((await app.inject({url:'/server/app.ts',headers:{host:'127.0.0.1:4173'}})).statusCode,404);
  const decoded=await normalizeImage({mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDwAAAABJRU5ErkJggg=='},new AbortController().signal);
  assert.equal(decoded.width,1);assert.equal(decoded.height,1);
  console.log('PASS: compiled Node image Worker decodes/re-encodes synthetic PNG.');
  console.log(`PASS: ${paths.length} production paths, ${bundles.length} bundled workbench/Worker assets and source isolation (Fastify inject; no browser or socket).`);
} finally {await app.close();}
