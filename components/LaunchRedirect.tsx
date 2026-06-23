"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 「アプリ起動 = メイン画面から」を保証するためのリダイレクト判定。
//
// PWA の manifest は start_url: "/main" を指定しているが、iOS 標準の
// standalone モードや一部ブラウザでは前回 URL を復元してくる場合がある。
// その時 (app) layout がいきなり /settings や /weight-history で
// マウントされ、ユーザーの「起動時はメニュー画面」期待に反する。
//
// sessionStorage は「同じセッションで持続、アプリを完全に閉じると消える」
// 性質を持つので、フラグが無い = この (app) 配下への最初のマウント = 起動
// と判定し、/main 以外にいたら /main に置き換える。リロードは
// sessionStorage が残るので影響なし。
const LAUNCH_FLAG = "gym-tracker-launched";

export default function LaunchRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let launched: string | null = null;
    try {
      launched = sessionStorage.getItem(LAUNCH_FLAG);
      sessionStorage.setItem(LAUNCH_FLAG, "1");
    } catch {
      // プライベートブラウジング等で sessionStorage が使えない場合は何もしない
      return;
    }
    if (!launched && pathname !== "/main") {
      router.replace("/main");
    }
    // 起動時の 1 回だけ判定すれば足りるので依存は意図的に空にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
