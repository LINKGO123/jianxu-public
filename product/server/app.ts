import Fastify from 'fastify';
import {registerNetworkCheck} from './connection-network.js';
import {registerImageRoutes,type EditImage} from './image-routes.js';
import {registerMcpRoutes} from './mcp-routes.js';
import type {McpOperation} from './mcp-client.js';
import {clearConnections} from './external-session.js';
import fastifyStatic from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerTextRoutes,connectionSummary,type LocalSession } from './text-routes.js';
import { secureCompletion,type Completion } from './text-network.js';
const origins = new Set(['http://127.0.0.1:4173', 'http://127.0.0.1:5173']);
const hosts = new Set(['127.0.0.1:4173', '127.0.0.1:5173']);
export async function buildApp(serveStatic = false,completion:Completion=secureCompletion,external:{image?:EditImage;mcp?:McpOperation}={}) {
    const app = Fastify({ logger: false, bodyLimit: 16 * 1024, requestTimeout: 10000, trustProxy: false });
    const sessions = new Map<string, LocalSession>();
    app.decorateRequest('localSession');
    const sweep=setInterval(()=>{for(const [id,session] of sessions)if(session.expires<=Date.now()){clearConnections(session);sessions.delete(id);}},60000);sweep.unref();
    app.addHook('onClose',async()=>{clearInterval(sweep);for(const session of sessions.values())clearConnections(session);sessions.clear();});
    app.addHook('onRequest', async (request, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
            .header('Cross-Origin-Resource-Policy', 'same-origin')
            .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        if (!hosts.has(request.headers.host ?? ''))
            return reply.code(403).send({ error: '不允许的 Host' });
        const origin = request.headers.origin;
        if (origin !== undefined && !origins.has(origin))
            return reply.code(403).send({ error: '不允许的来源' });
        if (request.headers['sec-fetch-site'] === 'cross-site')
            return reply.code(403).send({ error: '拒绝跨站请求' });
        if (request.url.startsWith('/api/'))
            reply.header('Cache-Control', 'no-store');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
            if (!origin || origin !== `http://${request.headers.host}`)
                return reply.code(403).send({ error: '需要同源请求' });
            const id = readSession(request.headers.cookie);let session = id ? sessions.get(id) : undefined;
            if(id&&session&&session.expires<=Date.now()){clearConnections(session);sessions.delete(id);session=undefined;}
            const token = request.headers['x-csrf-token'];
            if (!session || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken)))
                return reply.code(403).send({ error: '会话或 CSRF 校验失败' });
            request.localSession=session;
        }
    });
    app.get('/api/session', async (request, reply) => {
        const now = Date.now();
        for (const [id, s] of sessions)
            if (s.expires <= now)
                {clearConnections(s);sessions.delete(id);}
        const existing = readSession(request.headers.cookie);
        let id = existing && sessions.has(existing) ? existing : undefined;
        if (!id) {
            if (sessions.size >= 100)
                return reply.code(503).send({ error: '本机会话数量已达上限，请稍后重试' });
            id = randomBytes(32).toString('hex');
            sessions.set(id, { csrfToken: randomBytes(32).toString('hex'), expires: now + 8 * 60 * 60 * 1000 });
            reply.header('Set-Cookie', `jianxu_session=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`);
        }
        return { portraitWorkflow:'template-v2', csrfToken: sessions.get(id)!.csrfToken,...connectionSummary(sessions.get(id)!) };
    });
    registerTextRoutes(app,completion,external.mcp);
    registerNetworkCheck(app);registerImageRoutes(app,external.image);registerMcpRoutes(app,external.mcp);
    app.delete('/api/connections',async request=>{clearConnections(request.localSession);return {cleared:true};});
    app.setErrorHandler((_error, _request, reply) => reply.code(400).send({ error: '请求无效或超过限制' }));
    if (serveStatic)
        await app.register(fastifyStatic, { root: fileURLToPath(new URL('../client/', import.meta.url)), index: ['index.html'] });
    return app;
}
function readSession(cookie: string | undefined) { return cookie?.split(';').map(v => v.trim()).find(v => /^jianxu_session=[a-f0-9]{64}$/.test(v))?.split('=')[1]; }
