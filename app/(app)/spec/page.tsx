import HeaderMenu from "@/components/HeaderMenu";

export default function SpecPage() {
  return (
    <div className="pb-6">
      <div className="flex items-start justify-between px-4 pt-4 pb-2 gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">仕様書 / 使い方</h1>
          <p className="text-xs text-gray-500 mt-1">
            このアプリの使い方をまとめたページです
          </p>
        </div>
        <HeaderMenu />
      </div>
      <div className="h-px bg-gray-400 mx-4 mb-4" />

      <Section title="📱 アプリ概要">
        <p>
          ジムや家での筋トレを記録するための PWA アプリです。スマホのホーム画面に追加でき、オフラインでも動きます。
        </p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>メニュー（最大10）を曜日や間隔で出し分け</li>
          <li>セットごとの実績を記録し、重量推移をグラフで確認</li>
          <li>同じ名前の種目は複数メニューを横断して前回値・重量を共有</li>
        </ul>
        <p className="mt-2">
          画面右上の <span className="font-bold">☰</span> メニューから <span className="font-bold">設定 / メニュー / 重量推移 / 仕様書</span> を切り替えられます。
        </p>
      </Section>

      <Section title="🔐 ログイン">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>メールアドレスとパスワード（6文字以上）で登録・ログイン</li>
          <li>
            ログインしたデバイス間で同じアカウントなら、メニューと実績が自動で同期される
          </li>
          <li>
            一度ログインすればオフラインでも全機能が使える（再ログインは基本不要）
          </li>
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
        </ul>
      </Section>

      <Section title="💪 トップセット法（重要）">
        <p>このアプリは「トップセット法」前提で設計されています。</p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>
            <span className="font-bold">最終セット = トップ</span>（限界まで追い込むセット）
          </li>
          <li>
            <span className="font-bold">それ以外 = バックオフ</span>（kg を直接指定。多くは「全バックオフ同じ重量」で運用する）
          </li>
          <li>
            セットが1つだけの場合は、それがトップで「ストレートセット」扱い
          </li>
          <li>
            バックオフの重量を編集すると、デフォルトで <span className="font-bold">他のバックオフも同じ値に同期</span> される（ピッカーの「全バックオフに同期」OFF で個別入力も可）
          </li>
        </ul>
      </Section>

      <Section title="🏋️ メイン画面（今日のメニュー）">
        <p>今日の曜日・間隔に該当するメニューが自動で表示されます。</p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>該当メニューが無い日は「休み」と表示</li>
          <li>複数メニューが同日に該当した場合は部位ごとに合体</li>
          <li>椅子の高さも種目の近くに表示</li>
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

        <p className="font-bold mt-3">画面上の補助表示</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-bold">「更新 N回」</span>（右上）：バックオフの重量が TOP と同値に揃った回数。重量レベルを何段階上げたかの目安
          </li>
          <li>
            <span className="font-bold">「前回 Xkg ×Y回」</span>（各セット下）：そのセットを前回記録したときの実値。前回より落とさない目印に使う。
            <span className="font-bold">同じ名前の種目を複数メニューで使い回している場合は、どのメニューで実施したかに関わらず最新の記録</span> が表示される（TOP同士・バックオフは set_number 一致で対応）
          </li>
          <li>
            <span className="font-bold">TOP バッジ</span>：オレンジ枠で強調されているセットがトップ（限界セット）
          </li>
        </ul>
      </Section>

      <Section title="🔄 他メニューへの自動反映">
        <p>
          同じ種目名を <span className="font-bold">複数のメニュー</span> に登録している場合、片方で重量を変更すると「他のメニューにも反映しますか？」というダイアログが出ます。
        </p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>
            チェックしたメニューにだけ同じ値を書き込む
          </li>
          <li>
            設定画面からの変更は <span className="font-bold">重量＋レップ数</span> 両方が反映対象。記録画面（実績入力）からは <span className="font-bold">重量のみ</span>
          </li>
          <li>
            メニューAではダンベル、メニューBではマシンで「同じプレスでも重量レベルが違う」みたいな種目はチェックを外す
          </li>
        </ul>
      </Section>

      <Section title="📈 重量推移画面">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <span className="font-bold">部位ごとにまとめて</span> 表示（胸・背中・肩・腕・脚 …）
          </li>
          <li>種目ごとに過去の重量変化をグラフ表示</li>
          <li>
            <span className="font-bold">赤線 = TOP</span>（限界セット）、<span className="font-bold">青線 = バックオフ</span>、<span className="font-bold">緑点 = 揃った日</span>（全セットが同じ重量で完成した日）
          </li>
          <li>右上の「○○kg → ○○kg (+Nkg)」は「揃った日」だけを対象にした重量変化</li>
          <li>「詳細」を押すと日付ごとの重量とレップ数の一覧</li>
          <li>アシスト種目は値が下がるほど改善（右下がり = 進歩）</li>
        </ul>
      </Section>

      <Section title="📴 オフライン対応">
        <p>
          ジムで電波が無くても普通に使えます。データは端末内に保存され、オンラインに戻ったときに自動で同期されます。
        </p>
        <ul className="list-disc pl-5 space-y-0.5 mt-1">
          <li>
            未同期の編集があるときは画面上部にバナーが出る。<span className="font-bold">放置で OK</span>（オンライン復帰時に自動同期）。タップすると即時に同期を試みる
          </li>
          <li>ログインさえ済んでいればオフラインで全機能 OK</li>
          <li>ホーム画面に追加するとアプリのように起動できる（PWA）</li>
          <li>
            同期はクラウドと端末の <span className="font-bold">差分</span> を取って双方向で行われるので、別の端末で記録したデータも自動で取り込まれる
          </li>
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
        </ul>
      </Section>

      <p className="text-center text-xs text-gray-500 mt-6">
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
      <h2 className="text-base font-bold mb-2 pl-2 border-l-4 border-gray-800">
        {title}
      </h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-1">
        {children}
      </div>
    </section>
  );
}
