import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server/app.js';
test('SIM-020/030 L1: Host, Origin, Fetch Metadata, CSRF and bounded request bodies', async () => {
    const app = await buildApp();
    try {
        assert.equal((await app.inject({ url: '/api/session', headers: { host: 'attacker.example' } })).statusCode, 403);
        assert.equal((await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4173', origin: 'https://attacker.example' } })).statusCode, 403);
        assert.equal((await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4173', 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
        const response = await app.inject({ url: '/api/session', headers: { host: '127.0.0.1:4173' } });
        assert.equal(response.statusCode, 200);
        assert.match(String(response.headers['set-cookie']), /HttpOnly; SameSite=Strict/);
        assert.equal(response.headers['access-control-allow-origin'], undefined);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.json().connections.mcp, 'disabled');
        const cookie = String(response.headers['set-cookie']).split(';')[0], token = response.json().csrfToken;
        assert.equal((await app.inject({ method: 'POST', url: '/api/ai/text', headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', cookie }, payload: { url: 'http://127.0.0.1' } })).statusCode, 403);
        const headers = { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', cookie, 'x-csrf-token': token };
        // Stage C exposes these routes; malformed bodies must now be rejected by their schemas.
        assert.equal((await app.inject({ method: 'POST', url: '/api/ai/text', headers, payload: { url: 'http://169.254.169.254' } })).statusCode, 400);
        assert.equal((await app.inject({ method: 'PUT', url: '/api/connections/text', headers, payload: { apiKey: 'FICTIONAL_SENTINEL' } })).statusCode, 400);
        const huge = await app.inject({ method: 'POST', url: '/api/none', headers, payload: { text: 'x'.repeat(17000) } });
        assert.equal(huge.statusCode, 400);
        assert.ok(!response.body.includes('FICTIONAL_SENTINEL'));
        assert.ok(!response.body.includes(cookie.split('=')[1]));
    }
    finally {
        await app.close();
    }
});
