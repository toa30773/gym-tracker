import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "筋トレ記録",
  description: "筋トレメニューを記録するアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "筋トレ記録",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  if (!('serviceWorker' in navigator)) return;
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  function activate(worker) {
    if (!worker) return;
    worker.postMessage('SKIP_WAITING');
  }
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) activate(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            activate(nw);
          }
        });
      });
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    }).catch(function () {});
  });
})();`,
          }}
        />
      </head>
      <body className="h-full bg-white text-black">
        <div className="mx-auto max-w-[430px] h-full relative">
          {children}
        </div>
      </body>
    </html>
  );
}
