# 手書きメモ

スマホで指・タッチペンを使って書き、本文を編集して端末内に保存する、静的なPWAです。ログイン、サーバー、有料APIは使いません。

**日本語手書き認識は試作段階です。高精度な手書き認識を保証するアプリではありません。**

## 使い方

1. 横書きで、文字を大きく、離して書きます。薄い罫線は目安で、認識画像には含みません。
2. 「消しゴム」で部分消去を切り替え、指やペンでなぞって消します。「1つ戻す」で最後の描画・部分消去を取り消せます。「消去」は確認後に手書き全体を消し、ペンモードに戻します。本文・保存済みメモは保持します。
3. 「文字に変換」を押し、誤認識を本文欄で修正します。直接入力も可能です。
4. 「保存」で本文と保存日時を保存します。保存成功後に本文と手書きを空にします。
5. 保存したメモをタップすると全文と日時を表示します。削除は確認付きです。

メモは同じ端末・同じブラウザ・同じサイトのlocalStorageに保存します。Safariとホーム画面アプリ、別ブラウザ間で同じ保存領域を使う保証はありません。サイトデータの削除、プライベートブラウズ終了、端末変更などで失われることがあります。バックアップ・同期機能はありません。保存失敗時は入力本文を残します。

## OCRの調査と採用理由（2026-10-08）

| 候補 | GitHub Pages / スマホ対応 | 判断 |
| --- | --- | --- |
| Tesseract.js 6.0.1 + tessdata_best日本語モデル | Web WorkerとWebAssemblyで静的配信可能。現行Safari/Chromeが基盤APIに対応 | 無料・ローカル処理の試作として採用。ただしモデルは印刷文字向け |
| Web Handwriting Recognition API | OS依存・提案中のAPI。Safari/Android両方で日本語認識できる共通実装を確認できない | 必須機能に採用しない |
| KanjiCanvas | JavaScriptだけで筆順・画数に依存しない一文字認識と候補提示。静的Webへ組み込み可能 | MITで無料。文章全体の一括変換には向かず、一文字ずつ書いて候補を選ぶUIが必要。実筆跡の精度は未評価 |
| YomiToku軽量モデル | 日本語手書き対応。ブラウザ内WASM/WebGPU推論の公式デモあり | 非商用はCC BY-NC-SA 4.0で無料。商用は別ライセンス。独自アプリへの組み込み条件とスマホの速度・メモリ・精度を先に評価する必要あり |
| Google ML Kit Digital Ink Recognition | 手書き向け。Android/iOSのネイティブSDKであり、Web用SDKではない | SDK・端末内認識は無料だがネイティブ化が必要。通常のiOS配布にはApple Developer Programの費用がかかる |
| MyScript | 手書き向けだが商用サービス・契約が必要 | 有料APIを使わない条件に合わない |

Tesseract.js公式FAQは、手書きは非対応、印刷字のような字以外は結果が悪く、設定変更で大幅改善できないと説明しています。tessdata_bestは日本語OCRの精度を優先する浮動小数点モデルですが、**手書き専用モデルではありません**。続け字、くずし字、縦書き、図、交差する文字、多様な筆跡には弱く、空の結果もあり得ます。ページを横書きブロックとして読み取り、筆跡の余白を切り取り白背景を付けます。これは手書き対応や高精度を意味しません。

最新7.0.0でも検証しましたが、この日本語浮動小数点モデルで`DotProductSSE`の実行エラーが出たため、認識に成功した6.0.1（core 6.1.2）を固定しています。

現在の無料・静的Web・両OS対応という条件で、高精度な日本語手書き認識を確認できた方式はありません。実際の筆跡を多数集めて精度評価し、必要なら手書き用モデルの研究やネイティブアプリ化を別途検討する必要があります。

無料・ブラウザ維持を厳密に優先する場合はKanjiCanvasの一文字入力と候補選択を推奨します。今の複数文字の一括変換を維持する場合は、非商用用途を前提にYomiToku軽量モデルの小規模評価が候補です。これらは調査結果であり、利用者の承認前に認識方式や入力方式は変更していません。

調査資料：

- [Tesseract.js README](https://github.com/naptha/tesseract.js)
- [公式FAQ：手書き非対応](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md#is-handwritten-text-supported)
- [KanjiCanvasの仕様・MITライセンス](https://github.com/asdfjkl/kanjicanvas)
- [YomiTokuの手書き・ブラウザ対応とライセンス](https://github.com/kotaro-kinoshita/yomitoku/blob/main/README.md)
- [ML Kit Digital Ink Recognition](https://developers.google.com/ml-kit/vision/digital-ink-recognition)
- [Apple Developer Programの登録費用](https://developer.apple.com/jp/programs/enroll/)
- [ローカル配信の仕様](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [tessdata_best](https://github.com/tesseract-ocr/tessdata_best)
- [WICG手書き認識API提案：ML Kit・MyScript・Appleとの比較](https://github.com/WICG/handwriting-recognition/blob/main/explainer.md)
- [WebAssemblyの対応表](https://caniuse.com/wasm)

## OCRの不具合修正（2026-10-08）

日本語モデルを404にすると、置換確認でOKを押した後も「日本語の認識データを準備しています…」のままボタンが無効になる問題を再現しました。Tesseract.js 6.0.1の`createWorker`が`loadLanguage`/`initialize`の失敗を握りつぶして開始待ちのPromiseをrejectしないことが原因です。通常配信の日本語OCR・手書きサンプル・オフライン変換は修正前にも成功しました。利用者の端末で発生した具体的な通信エラーは、旧画面に詳細表示がないため断定できません。

- 初期化とWorker内のエラーを呼び出し元へ返し、失敗・完了時にはWorkerを終了します。180秒のタイムアウトで停止した読み込みも中断し、再試行できます。
- ライブラリ、エンジン、日本語データ、初期化、認識の各段階と進捗率・経過時間を表示します。失敗時は段階とエラー詳細を表示し、既存の本文・筆跡を保持します。
- Tesseract.jsを変換時に読み込み、ライブラリ読み込み失敗後の再試行にも対応します。ファイルURLは`app.js`の配信ディレクトリを基準に解決するので、GitHub Pagesのサブパスや`index.html?from=home`でも同じ配置を参照します。
- 日本語モデルは固定コミット・SHA-256検証を維持します。Service Workerのキャッシュは`handwriting-memo-v2-ocr`へ更新し、保存メモのキーは維持します。更新時はアプリのタブやホーム画面アプリをすべて閉じて開き直してください。
- テストは実OCRに加え、置換確認のOK/キャンセル、ライブラリ・Worker・core・日本語データの404、破損データ、タイムアウト、空の結果、認識中のWorkerエラー、失敗後の再試行を確認します。GitHub Actionsでもテストに成功してから公開します。

## 消去の修正（2026-10-08）

「消去」と表示していたボタンは全消去ではなく消しゴムモードの切り替えでした。部分消去を「消しゴム」、確認後の全消去を「消去」に分け、モード・消去・キャンセル・空の入力の状態を画面に表示します。全消去は描画中の筆跡も破棄してポインター捕捉を解除し、ペンに戻します。本文と保存済みメモは保持します。Service Workerのキャッシュは`handwriting-memo-v3-clear`に更新しています。

Chromiumで390px・412px幅のタッチ端末をエミュレーションし、連続タッチ描画、消去確認のOK/キャンセル、部分消去と取り消し、本文・保存メモの保持、再描画をテストします。描画途中のマウス操作からの全消去も確認します。iPhone/Androidの実機とiOS Safariでは未確認です。認識エンジンは利用者の承認まで変更しません。

## 構成とプライバシー

HTML / CSS / JavaScriptのみ。フレームワークやバックエンドはありません。キャンバスの筆跡だけを白背景画像にしてOCRします。メモや筆跡は外部に送信せず、認識も端末内で実行します。

ビルド時にnpmからTesseract.jsを導入し、固定コミットの日本語モデルをGitHubから取得してSHA-256を検証します。Tesseract.js 6.0.1の初期化エラーが未完了になる経路を、`scripts/bundle-ocr.mjs`の検証付きソースパッチで修正し、esbuildでブラウザ用にバンドルします。`dist/vendor`にエンジンとモデルを同梱するので、利用時に外部CDNやAPIへの接続は不要です。日本語モデルは圧縮前約14 MBで、初回は同一サイトからエンジンとモデルのダウンロードが必要です。スマホでは読み込みと認識に時間がかかり、古い端末ではメモリ不足になる可能性があります。

## 開発・確認

Node.js 24、npm、Python 3、curlを使用します。

```sh
npm ci --ignore-scripts
npm run build
npm start
```

`dist`を配信します。HTMLをファイルとして直接開く方法はWorkerとPWAに対応しません。開発用HTTPはlocalhost、公開用はHTTPSを使ってください。生成物`dist`はGitに含めません。

```sh
# Chromiumが/usr/bin/chromiumにある環境
npm test
# それ以外：PlaywrightのChromiumを導入し、実行ファイルを指定
npx playwright install chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm test
```

テストはスマホ幅で描画・消去・取り消し・全消去、保存とリロード、全文表示、削除、保存失敗時の入力保持、実際の日本語OCR、サブパス配信、外部リクエストなし、オフライン再起動とOCRを確認します。OCR用の活字体サンプルはエンジンの動作確認であり、手書き精度の評価ではありません。手動で定義した筆跡の「日本」も正しく認識できましたが、一つの整ったサンプルに限った結果で、実際の多様な筆跡の精度は未評価です。

## GitHub Pagesで公開

1. この変更をリポジトリの`main`にコミット・pushします。
2. GitHubの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
3. `Deploy GitHub Pages`ワークフローが`dist`をビルドして公開します。手動実行も可能です。

すべて相対パスで、`/handwriting-memo/`などのプロジェクトサイトに対応します。mainへのpushでテストを実行し、成功した場合に再デプロイします。

## PWAとオフライン

- iPhone：Safariの共有 →「ホーム画面に追加」。
- Android：Chromeのメニュー →「ホーム画面に追加」または「アプリをインストール」。
- ホーム画面では`standalone`表示になります。
- アプリ画面は初回読み込み時にキャッシュ。OCRモデルと端末に合うエンジンは初回変換時にキャッシュするため、**一度オンラインで変換に成功した後**にオフライン認識が可能です。ブラウザがキャッシュを削除した場合は再読み込みが必要です。
- 更新時には`sw.js`のキャッシュ名を変更してください。すべてのアプリ画面を閉じて再起動すると更新が有効になります。メモの保存キーは維持してください。

WebKitの追加検証はブラウザ配布元へのアクセスがネットワークポリシーで拒否され、実行できませんでした。

実機のiPhone Safari / Android Chrome、およびホーム画面からの起動はこのクラウド環境では未検証です。両方の現行ブラウザが対応するAPIを使っていますが、公開後に実機でタッチ入力、変換、保存、再起動、ホーム画面追加を確認してください。

## ライセンス

Tesseract.js、tesseract.js-core、日本語tessdata_bestはApache-2.0。ライセンス情報を`dist/vendor`に同梱します。
