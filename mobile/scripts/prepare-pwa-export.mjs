import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distDir = path.join(projectRoot, 'dist');
const appIconPath = path.join(projectRoot, 'assets', 'app', 'icon.png');
const pwaIconPath = path.join(distDir, 'pwa-icon.png');

const brand = {
  name: 'グッとれ',
  subtitle: 'グッズ交換管理アプリ',
  description: 'グッズ交換の在庫、取引、発送予定をアカウントごとに管理できるアプリです。',
  themeColor: '#176b87',
  backgroundColor: '#f7f5f0',
};

await copyFile(appIconPath, pwaIconPath);
await writeManifest();
await writeOfflinePage();
await writeServiceWorker();
await patchHtml();
await writeSitesWorker();

async function writeManifest() {
  const manifest = {
    id: '/',
    name: `${brand.name} - ${brand.subtitle}`,
    short_name: brand.name,
    description: brand.description,
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: brand.themeColor,
    background_color: brand.backgroundColor,
    icons: [
      {
        src: '/pwa-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };

  await writeFile(
    path.join(distDir, 'manifest.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function writeOfflinePage() {
  const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="${brand.themeColor}" />
    <title>${brand.name}</title>
    <style>
      body {
        align-items: center;
        background: ${brand.backgroundColor};
        color: #17202a;
        display: flex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
      }
      main {
        background: #fff;
        border: 1px solid #d8d2c5;
        border-radius: 8px;
        margin: auto;
        max-width: 420px;
        padding: 24px;
      }
      h1 {
        font-size: 24px;
        margin: 0 0 10px;
      }
      p {
        color: #68717d;
        font-size: 15px;
        line-height: 1.7;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>通信できません</h1>
      <p>グッとれを開くにはインターネット接続が必要です。接続を確認してから、もう一度開いてください。</p>
    </main>
  </body>
</html>
`;

  await writeFile(path.join(distDir, 'offline.html'), html, 'utf8');
}

async function writeServiceWorker() {
  const sw = `const CACHE_NAME = 'guttore-pwa-${Date.now()}';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-icon.png', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          return (await caches.match('/index.html')) ?? caches.match('/offline.html');
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;

  await writeFile(path.join(distDir, 'sw.js'), sw, 'utf8');
}

async function writeSitesWorker() {
  const serverDir = path.join(distDir, 'server');
  await mkdir(serverDir, { recursive: true });

  const assets = await collectWorkerAssets(distDir);
  const worker = `const ASSETS = ${JSON.stringify(assets, null, 2)};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function contentTypeFor(pathname) {
  const match = pathname.match(/\\.[^.\\/]+$/);
  return CONTENT_TYPES[match?.[0] ?? ''] ?? 'application/octet-stream';
}

function decodeBase64(value) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function assetResponse(pathname, status = 200) {
  const asset = ASSETS[pathname];
  if (!asset) return null;

  const body = asset.encoding === 'base64' ? decodeBase64(asset.body) : asset.body;
  const headers = new Headers({
    'Content-Type': contentTypeFor(pathname),
  });

  if (pathname !== '/index.html' && pathname !== '/sw.js') {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    headers.set('Cache-Control', 'no-cache');
  }

  return withSecurityHeaders(new Response(body, { status, headers }));
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const direct = assetResponse(pathname);
    if (direct) return direct;

    if (request.method === 'GET' && !pathname.split('/').pop()?.includes('.')) {
      return assetResponse('/index.html');
    }

    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if (request.method === 'GET' && acceptsHtml) {
      return assetResponse('/index.html');
    }

    return new Response('Not Found', { status: 404 });
  },
};
`;

  await writeFile(path.join(serverDir, 'index.js'), worker, 'utf8');
}

async function collectWorkerAssets(rootDir) {
  const assets = {};
  await visit(rootDir);
  return assets;

  async function visit(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entryPath.includes(`${path.sep}server${path.sep}`)) continue;

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      const publicPath = `/${path.relative(rootDir, entryPath).replace(/\\/g, '/')}`;
      const ext = path.extname(entryPath).toLowerCase();
      const binary = ['.png', '.ico'].includes(ext);
      const body = await readFile(entryPath, binary ? undefined : 'utf8');
      assets[publicPath] = {
        encoding: binary ? 'base64' : 'text',
        body: binary ? body.toString('base64') : body,
      };
    }
  }
}

async function patchHtml() {
  const indexPath = path.join(distDir, 'index.html');
  let html = await readFile(indexPath, 'utf8');

  html = html
    .replace('<html lang="en">', '<html lang="ja">')
    .replace('httpEquiv="X-UA-Compatible"', 'http-equiv="X-UA-Compatible"')
    .replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
      `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="${brand.description}" />
    <meta name="theme-color" content="${brand.themeColor}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="${brand.name}" />
    <meta property="og:title" content="${brand.name}" />
    <meta property="og:description" content="${brand.description}" />
    <meta property="og:type" content="website" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/pwa-icon.png" />`,
    )
    .replace(
      'You need to enable JavaScript to run this app.',
      'グッとれを使うにはJavaScriptを有効にしてください。',
    );

  const registration = `<script>
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  </script>`;

  if (!html.includes("navigator.serviceWorker.register('/sw.js')")) {
    html = html.replace('</body>', `${registration}\n</body>`);
  }

  await writeFile(indexPath, html, 'utf8');
}
