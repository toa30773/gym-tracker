export default function SpecPage() {
  return (
    <div className="pb-6">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-base font-bold">仕様書 / 使い方</h1>
        <p className="text-[10px] text-gray-500 mt-1">
          このアプリの使い方をまとめたページです
        </p>
      </div>
      <div className="h-px bg-black mx-4 mb-4" />

      <Section title="📱 アプリ概要">
        <p>
          ジムや家での筋トレを記録するための PWA アプリです。スマホのホーム画面に追加でき、オフラインでも動きます。
        </p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>メニュー（最大10）を曜日や間隔で出し分け</li>
          <li>セットごとの実績を記録し、自動で進歩を提案</li>
          <li>重量推移をグラフで確認</li>
        </ul>
      </Section>

      <Section title="⚙️ 設定画面（メニュー設定）">
        <p className="font-bold">メニューの作り方</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>右下の数字ボタンでメニューを切り替え（最大10メニュー）</li>
          <li>右上のチップから曜日・間隔を設定</li>
          <li>
            <span className="font-bold">曜日のみ</span>：選んだ曜日に毎週そのメニューが出る
          </li>
          <li>
            <span className="font-bold">間隔指定</span>：起点曜日 + N 日おきで出す（1日だけ選ぶと入力可能になる）
          </li>
        </ul>

        <p className="font-bold mt-3">部位・種目の追加</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-bold">画面中央の ＋</span>：新しい部位グループを追加
          </li>
          <li>
            <span className="font-bold">種目行の右の ＋</span>：同じ部位グループ内に空の種目を追加
          </li>
          <li>
            <span className="font-bold">− ボタン</span>：その種目またはセットを削除
          </li>
          <li>
            <span className="font-bold">▲ ▼</span>：種目の並び替え
          </li>
          <li>
            <span className="font-bold">「他のメニューから」</span>：他のメニューの種目をコピーして追加
          </li>
        </ul>

        <p className="font-bold mt-3">セットの入力項目</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-bold">重量・レップ数</span>：ボタンを押してテンキー / ピッカーで入力
          </li>
          <li>
            <span className="font-bold">椅子の高さ</span>：マシン番号や高さのメモ（任意）
          </li>
          <li>
            <span className="font-bold">刻み</span>：そのマシンの重量ステップ（0.25〜10kg）
          </li>
          <li>
            <span className="font-bold">アシスト</span>：チンニング等の補助マシン用（数値が小さいほど高負荷）
          </li>
          <li>
            <span className="font-bold">メモ</span>：種目ごとに自由記入
          </li>
        </ul>
      </Section>

      <Section title="💪 トップセット法（重要）">
        <p>このアプリは「トップセット法」前提で設計されています。</p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>
            <span className="font-bold">最終セット = トップ</span>（限界まで追い込むセット）
          </li>
          <li>
            <span className="font-bold">それ以外 = バックオフ</span>（トップに対する％で重量を指定。例: 85%）
          </li>
          <li>
            セットが1つだけの場合は、それがトップで「ストレートセット」扱い
          </li>
          <li>
            トップ重量を変えるとバックオフは自動で再計算される
          </li>
        </ul>
      </Section>

      <Section title="🏋️ メイン画面（今日のメニュー）">
        <p>今日の曜日・間隔に該当するメニューが自動で表示されます。</p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>該当メニューが無い日は「休み」と表示</li>
          <li>複数メニューが同日に該当した場合は部位ごとに合体</li>
          <li>椅子の高さ・メモも種目の近くに表示</li>
        </ul>

        <p className="font-bold mt-3">完了の操作</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-bold">種目を左にスワイプ</span> → 緑の「完了」ボタンを押す
          </li>
          <li>実績入力モーダルが開き、実際の重量とレップ数を記録</li>
          <li>記録するとその種目はその日のメニューから消える</li>
          <li>ある部位の種目が全て完了すると、その部位も消える</li>
          <li>すべて完了すると「コンプリート」が表示される</li>
        </ul>

        <p className="font-bold mt-3">進歩の自動提案</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            トップが <span className="font-bold">+3回以上オーバー</span>、または <span className="font-bold">+方向が2回連続</span> → 重量アップを提案
          </li>
          <li>
            トップが <span className="font-bold">-3回以上不足</span>、または <span className="font-bold">-方向が2回連続</span> → 重量ダウンを提案
          </li>
          <li>
            自重種目（重量0）の場合はレップ数の増減で提案
          </li>
          <li>
            「計画に反映」で次回からの計画が自動更新される
          </li>
        </ul>
      </Section>

      <Section title="📈 重量推移画面">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>種目ごとに過去の重量変化をグラフ表示</li>
          <li>「詳細」を押すと日付ごとの重量とレップ数の一覧</li>
          <li>アシスト種目は値が下がるほど改善（右下がり = 進歩）</li>
        </ul>
      </Section>

      <Section title="📴 オフライン対応">
        <p>
          ジムで電波が無くても普通に使えます。データは端末内に保存され、オンラインに戻ったときに自動で同期されます。
        </p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>未同期件数があるときは画面上部にバナーが出る</li>
          <li>ログインさえ済んでいればオフラインで全機能 OK</li>
          <li>ホーム画面に追加するとアプリのように起動できる（PWA）</li>
        </ul>
      </Section>

      <Section title="💡 ちょっとしたコツ">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            最初は メニュー1 だけ作って、慣れてきたら 2・3 を追加するとラク
          </li>
          <li>
            重量はマシンによって刻みが違う。種目ごとに「刻み」を正しく設定すると入力が早くなる
          </li>
          <li>
            記録は必ず「完了」を押してから。メモだけ書いて閉じても実績は残らない
          </li>
        </ul>
      </Section>

      <p className="text-center text-[10px] text-gray-400 mt-6">
        困ったら作った人に聞いてください
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 mb-5">
      <h2 className="text-sm font-bold mb-2">{title}</h2>
      <div className="text-xs text-gray-700 leading-relaxed space-y-1">
        {children}
      </div>
    </section>
  );
}
