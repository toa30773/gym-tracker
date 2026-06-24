import SyncBootstrap from "@/components/SyncBootstrap";
import LaunchRedirect from "@/components/LaunchRedirect";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <SyncBootstrap />
      <LaunchRedirect />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {/* ページ固有のアクションバーをここへ Portal で差し込む。
          スクロールコンテナの外なので iOS Safari の sticky バグの影響を受けない。
          safe-area は各アクションバーの内側で取る（バーの背景を下端まで延ばすため）。 */}
      <div id="app-action-bar-slot" className="flex-shrink-0" />
    </div>
  );
}
