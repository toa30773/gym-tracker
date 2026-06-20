import BottomNav from "@/components/BottomNav";
import SyncBootstrap from "@/components/SyncBootstrap";
import { NavGuardProvider } from "@/lib/nav-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavGuardProvider>
      <div className="flex flex-col h-full">
        <SyncBootstrap />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        {/* ページ固有のアクションバーをここへ Portal で差し込む。
            スクロールコンテナの外なので iOS Safari の sticky バグの影響を受けない。 */}
        <div id="app-action-bar-slot" className="flex-shrink-0" />
        <div className="flex-shrink-0">
          <BottomNav />
        </div>
      </div>
    </NavGuardProvider>
  );
}
