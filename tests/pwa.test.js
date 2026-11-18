import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const scope = 'https://example.github.io/decisionplayground/';
const manifestUrl = new URL('../manifest.webmanifest', import.meta.url);

test('manifest supports installation under the GitHub Pages project path', () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], scope).href, scope);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));

  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(icon.src, manifestUrl));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('service worker caches only static files and serves project navigation offline', async () => {
  const events = new Map();
  const saved = new Map();
  const removed = [];
  let claimed = false;
  const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    URL, Request,
    self: {
      registration: { scope },
      clients: { claim() { claimed = true; } },
      addEventListener(name, handler) { events.set(name, handler); },
    },
    caches: {
      async open() {
        return {
          async addAll(requests) {
            for (const { url } of requests) saved.set(url, { fixture: url });
          },
          async match(url) { return saved.get(url); },
        };
      },
      async keys() {
        return [`decision-playground:${scope}:old`, `decision-playground:${scope}:local-v1`, 'another-app'];
      },
      async delete(name) { removed.push(name); },
    },
    fetch() { throw new Error('The test is offline'); },
  });

  for (const name of ['install', 'activate']) {
    let work;
    events.get(name)({ waitUntil(promise) { work = promise; } });
    await work;
  }
  assert.equal(claimed, true);
  assert.deepEqual(removed, [`decision-playground:${scope}:old`]);
  assert.ok(saved.has(scope + 'recordings.js'));
  assert.ok(saved.has(scope + 'manifest.webmanifest'));
  assert.ok([...saved.keys()].every(url => url.startsWith(scope)));

  const request = (url, method = 'GET', mode = 'cors') => {
    let response;
    events.get('fetch')({ request: { url, method, mode }, respondWith(value) { response = value; } });
    return response;
  };
  assert.deepEqual(await request(scope + 'index.html?offline=yes', 'GET', 'navigate'), { fixture: scope });
  assert.deepEqual(await request(scope + 'app.js'), { fixture: scope + 'app.js' });
  assert.equal(request('https://openrouter.ai/api/alpha/decisions', 'POST'), undefined);
  assert.equal(request(scope + 'app.js', 'POST'), undefined);
  assert.equal(request('https://example.github.io/another-project/', 'GET', 'navigate'), undefined);
});
