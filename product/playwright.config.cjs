const path=require('node:path');
const {defineConfig}=require(path.join(process.env.JIANXU_PLAYWRIGHT_ROOT,'test.js'));
const run=path.resolve(process.env.JIANXU_E2E_RUN||'../output/testing/RUN-20261029-002');
const current=process.env.JIANXU_E2E_CURRENT==='1';
module.exports=defineConfig({
 testDir:'./tests/e2e',testMatch:current?'**/current-smoke.current.cjs':'**/*.spec.cjs',workers:1,retries:0,timeout:60000,
 expect:{timeout:15000},fullyParallel:false,
 outputDir:path.join(run,'test-results',process.env.JIANXU_E2E_RESULT||'final'),
 reporter:[['list'],['json',{outputFile:path.join(run,process.env.JIANXU_E2E_RESULT||'e2e-results.json')}]],
 use:{baseURL:current?'http://127.0.0.1:4173':'http://127.0.0.1:5173',viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true,serviceWorkers:'block',trace:'off',screenshot:'only-on-failure',launchOptions:{executablePath:process.env.JIANXU_CHROMIUM_EXECUTABLE}},
 webServer:current?undefined:{command:'node tests/e2e/server.mjs',url:'http://127.0.0.1:5173/',reuseExistingServer:false,timeout:15000}
});
