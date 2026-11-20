import { spawn } from 'node:child_process';
const children = ['dev:server', 'dev:client'].map(script => spawn('npm', ['run', script], { stdio: 'inherit' }));
let stopping = false;
function stop(code) { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
children.forEach(child => { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 1)); });
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));
