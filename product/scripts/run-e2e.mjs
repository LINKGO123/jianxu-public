import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
const require=createRequire(import.meta.url);
const root=process.env.JIANXU_PLAYWRIGHT_ROOT||dirname(require.resolve('playwright/package.json'));
const result=spawnSync(process.execPath,[join(root,'cli.js'),'test','--config=playwright.config.cjs',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,JIANXU_PLAYWRIGHT_ROOT:root}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
