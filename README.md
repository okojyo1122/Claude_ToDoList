# チームタスク管理アプリ (Claude × Asana MCP)

Asana で管理しているチームのタスクを、AI キャラクター常駐の Web UI から操作できる社内向けタスク管理アプリです(やしろAIタスク管理アプリ風)。

- ✨ **Claude が常駐** → Claude ロゴ風のマスコットが吹き出しでタスク状況にコメント。完了したら労ってくれて、期限切れには注意喚起。ミニキャラのお祝い演出付き
- 🗣 **口調モードを選択可能** → 「ビジネス / フレンドリー / 熱血コーチ」の3パターンから画面上で切替(選択はブラウザに記憶)。`config/personas.json` で自社カスタム口調の追加・差し替えも可能
- 📌 **タスクボード** → 「⚠️ 期限切れ / 🔥 今日やること / 📅 予定」の3列カンバン。カードのチェックで完了 → Asana に即反映
- 🔥 **「今日のタスク教えて」** → チャットでも Asana から割り当てタスクを取得し、整理して表示
- 📝 **議事録・作業報告を貼り付け** → Claude がアクションアイテムを抽出し、Asana へのタスク追加・完了・更新を自動で反映
- 🏢 **組織階層でのフィルタ** → 部 > グループ > チーム > 人 の単位で表示範囲を切り替え

## 仕組み

```
ブラウザ (チャットUI)
   │  NDJSON ストリーミング
   ▼
Express サーバ (Node.js / TypeScript)
   │  Anthropic Messages API (MCP コネクタ)
   ▼
Claude (claude-opus-5) ──▶ Asana MCP サーバ (mcp.asana.com)
```

Asana への接続は Anthropic の **MCP コネクタ**(`mcp-client` ベータ)を使っており、Claude がサーバサイドで Asana MCP のツール(タスク検索・作成・更新など)を直接呼び出します。アプリ側にツール実行ループはありません。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` に以下を設定します:

| 変数 | 説明 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API キー ([console.anthropic.com](https://console.anthropic.com/) で取得) |
| `ASANA_MCP_TOKEN` | Asana MCP サーバ用の OAuth アクセストークン(下記参照) |

### Asana MCP トークンの取得

Asana の公式 MCP サーバ (`https://mcp.asana.com/sse`) は OAuth 認証を使用します。

1. [Asana 開発者コンソール](https://app.asana.com/0/developer-console) で OAuth アプリを作成
2. OAuth フローを通してアクセストークンを取得し、`ASANA_MCP_TOKEN` に設定

トークンが期限切れになると Asana ツールの呼び出しが失敗するので、その場合はトークンを更新してください。詳細は [Asana MCP ドキュメント](https://developers.asana.com/docs/using-asanas-mcp-server) を参照。

### 3. 組織構成の設定

```bash
cp config/org.example.json config/org.json
```

`config/org.json` を自社の 部 > グループ > チーム > メンバー 構成に合わせて編集します。`asanaEmail` には各メンバーの Asana アカウントのメールアドレスを設定してください(Claude がタスクの担当者を特定するのに使います)。

### (任意) 口調モードのカスタマイズ

デフォルトで「ビジネス / フレンドリー / 熱血コーチ」の3モードが組み込まれています。差し替えたい場合は `config/personas.json` に次の形式の配列を置きます:

```json
[
  {
    "id": "biz",
    "label": "ビジネス",
    "emoji": "✨",
    "greeting": "お疲れさまです。「🔄 更新」でタスクを読み込みます。",
    "description": "丁寧で落ち着いたビジネス敬語。簡潔かつ的確に伝える。"
  }
]
```

`description` が Claude への口調指示になります。

### 4. 起動

```bash
npm run dev        # 開発 (ホットリロード)
# または
npm run build && npm start   # 本番
```

http://localhost:3000 を開きます。

## 使い方

| 操作 | 説明 |
|---|---|
| 🔄 更新 | Asana からタスクを取得してボードに表示(キャラクターが総評コメント) |
| ボードのチェックボックス | タスクを完了にして Asana に即反映(キャラクターが褒めてくれる) |
| 「今日のタスク教えて」 | チャットで今日期限・期限切れ・今後の予定を整理して表示 |
| 議事録を貼り付け | アクションアイテムを抽出 → Asana にタスク作成・完了を反映 → 結果を報告 |
| 画面上部のセレクタ | 部 / グループ / チーム / 人 で表示スコープを切替 |
| キャラクター横のセレクタ | 口調モード(ビジネス / フレンドリー / 熱血コーチ)を切替 |
| 🗑 リセット | 会話履歴をクリア |

## 補足

- 会話履歴はサーバのメモリ上に保持されます(再起動で消えます)
- 安全のため、タスクの**削除**は行わない設計です(完了への変更のみ)
- モデルは既定で `claude-opus-5`(`.env` の `CLAUDE_MODEL` で変更可)。安全上の拒否時に別モデルへ自動フォールバックするサーバサイドフォールバックを有効にしています
