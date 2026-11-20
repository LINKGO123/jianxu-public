import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.env.JIANXU_E2E_RUN||'../output/testing/RUN-20261029-002','runtime');
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--emptyOutDir','--outDir',join(root,'client')],['node_modules/typescript/bin/tsc','-p','tsconfig.server.json','--outDir',root]]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
mkdirSync(root,{recursive:true});if(!existsSync(join(root,'node_modules')))symlinkSync(resolve('node_modules'),join(root,'node_modules'),'dir');
