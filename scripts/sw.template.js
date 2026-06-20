// The literal below is replaced at build time by scripts/stamp-sw.mjs so that every
// deploy produces a distinct cache key and forces clients to refetch.
const BUILD_ID = "__BUILD_ID__";
const STATIC_CACHE = `gym-tracker-static-${BUILD_ID}`;
const RUNTIME_CACHE = `gym-tracker-runtime-${BUILD_ID}`;

// 起動時にアプリの殻を確実にキャッシュ。
// 各ルートに加えオフライン時のフォールバック用も。
const APP_SHELL = [
  "/",
  "/main",
  "/settings",
  "/weight-history",
  "/login",
  "/manifest.json",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // 失敗しても install をブロックしないよう個別に追加
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      // 新バージョンを即時待機解除
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// クライアントから即時更新を要求されたら waiting を解除
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// Next.js のビルド成果物は immutable: Cache First
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 同一オリジン以外（Supabase など）は素通し。
  // オフラインでも IndexedDB 経由で動かす想定なので SW は触らない。
  if (!isSameOrigin(url)) return;

  // ナビゲーション: ネット優先 → ダメならキャッシュ → それもダメなら offline.html
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const runtime = await caches.open(RUNTIME_CACHE);
          return (
            (await runtime.match(request)) ||
            (await cache.match(request)) ||
            (await cache.match("/main")) ||
            (await cache.match("/")) ||
            (await cache.match("/offline.html")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // immutable な静的アセット: Cache First
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // それ以外の同一オリジン GET: Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => null);
      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
