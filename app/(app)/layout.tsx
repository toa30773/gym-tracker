import BottomNav from "@/components/BottomNav";
import SyncBootstrap from "@/components/SyncBootstrap";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <SyncBootstrap />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <div className="flex-shrink-0">
        <BottomNav />
      </div>
    </div>
  );
}
