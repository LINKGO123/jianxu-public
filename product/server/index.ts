import { buildApp } from './app.js';
const app = await buildApp(!process.argv.includes('--dev') && import.meta.url.endsWith('.js'));
try {
    await app.listen({ host: '127.0.0.1', port: 4173 });
    console.log('简序本地服务：http://127.0.0.1:4173');
}
catch {
    console.error('本地服务启动失败，请检查 4173 端口是否被占用。');
    process.exitCode = 1;
}
