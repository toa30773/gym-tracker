import BottomNav from "@/components/BottomNav";
import TimerPanel from "@/components/TimerPanel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <div className="flex-shrink-0">
        <TimerPanel />
        <BottomNav />
      </div>
    </div>
  );
}
