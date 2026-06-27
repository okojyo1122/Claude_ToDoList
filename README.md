# TaskFlow - 技術部タスク管理システム

技術部向けのカンバン方式タスク管理 Web アプリです。チーム別・個人別でタスクを管理できます。

## アーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│                        技術部メンバー                          │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼────────────────────────────────────┐
│                   Amazon CloudFront                           │
│   ┌─────────────────┐        ┌────────────────────────────┐  │
│   │ /api/* → APIGW  │        │ /* → S3 (React SPA)        │  │
│   └─────────────────┘        └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼──────────────────┐
         ▼                ▼                  ▼
┌─────────────┐  ┌──────────────┐  ┌───────────────────┐
│ API Gateway │  │ Amazon S3    │  │  Amazon Cognito    │
│  REST API   │  │  (Frontend)  │  │  (認証・チーム管理) │
└──────┬──────┘  └──────────────┘  └───────────────────┘
       │
       ├─── Lambda: tasks.js    ──→ DynamoDB: tasks
       ├─── Lambda: comments.js ──→ DynamoDB: task-comments
       └─── Lambda: users.js    ──→ Cognito API
```

## 機能

### タスク管理 (カンバン方式)
- **4ステータス**: Todo / In Progress / Review / Done
- ドラッグ&ドロップでステータス変更
- **優先度**: Low / Medium / High / Urgent
- タスクへのコメント機能
- 期限設定・期限切れアラート
- タグ管理

### 組織管理
- **チーム別表示**: frontend / backend / infrastructure / qa (カスタマイズ可)
- **個人別表示**: マイタスク (自分が担当のタスクのみ)
- **全チーム表示**: 技術部全体のタスク俯瞰

### 検索・フィルタ
- タイトル・説明・担当者名でのキーワード検索
- 優先度フィルタ

## ディレクトリ構成

```
.
├── frontend/               # React + TypeScript (Vite)
│   ├── src/
│   │   ├── api/           # API クライアント
│   │   ├── components/    # UI コンポーネント
│   │   ├── aws-config.ts  # AWS 設定
│   │   └── App.tsx        # エントリポイント
│   └── .env.example       # 環境変数テンプレート
├── backend/
│   ├── handlers/          # Lambda ハンドラ (Node.js)
│   │   ├── tasks.js       # タスク CRUD
│   │   ├── comments.js    # コメント CRUD
│   │   └── users.js       # ユーザー・チーム情報
│   └── layer/nodejs/      # Lambda Layer (共通ライブラリ)
├── infrastructure/        # AWS CDK (TypeScript)
│   └── lib/
│       ├── app.ts
│       └── task-management-stack.ts
└── .github/workflows/
    └── deploy.yml         # CI/CD パイプライン
```

## デプロイ手順

### 前提条件
- AWS CLI 設定済み (`aws configure`)
- Node.js 20+

### 1. 初回セットアップ

```bash
# インフラ依存パッケージインストール
cd infrastructure && npm install

# フロントエンド依存パッケージインストール
cd ../frontend && npm install
```

### 2. CDK Bootstrap (初回のみ)

```bash
cd infrastructure
npx cdk bootstrap
```

### 3. フロントエンドビルド

```bash
cd frontend
cp .env.example .env.local
# .env.local を編集して CDK の Output 値を設定
npm run build
```

### 4. デプロイ

```bash
cd infrastructure
npx cdk deploy
```

CDK の Output に以下が表示されます:
- `FrontendUrl`: アプリの URL (CloudFront)
- `ApiUrl`: API Gateway の URL
- `UserPoolId` / `UserPoolClientId`: Cognito の設定値

### 5. ユーザー作成

AWS コンソール → Cognito → ユーザープール → ユーザーを作成してチームグループに追加します。

```bash
# CLI でユーザー作成例
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com

# チームグループに追加
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username user@example.com \
  --group-name frontend
```

## GitHub Actions CI/CD

以下のシークレットを GitHub リポジトリに設定してください:

| シークレット | 説明 |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | AWS シークレットキー |
| `VITE_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_USER_POOL_CLIENT_ID` | Cognito Client ID |
| `VITE_API_URL` | API Gateway URL |

`main` ブランチへの push で自動デプロイされます。

## DynamoDB テーブル設計

### tasks テーブル
| 属性 | 型 | 説明 |
|---|---|---|
| teamId (PK) | String | チーム ID |
| taskId (SK) | String | タスク ID (task-{uuid}) |
| title | String | タスクタイトル |
| description | String | 説明 |
| status | String | todo / in_progress / review / done |
| priority | String | low / medium / high / urgent |
| assigneeId | String | 担当者の Cognito sub |
| assigneeName | String | 担当者名 |
| dueDate | String | 期限 (ISO 8601) |
| tags | List | タグリスト |
| createdAt / updatedAt | String | タイムスタンプ |

GSI:
- `assignee-index`: assigneeId でクエリ (マイタスク機能)
- `status-index`: teamId + status でクエリ

### task-comments テーブル
| 属性 | 型 | 説明 |
|---|---|---|
| taskId (PK) | String | タスク ID |
| commentId (SK) | String | コメント ID |
| content | String | コメント内容 |
| authorId | String | 投稿者 ID |
| authorEmail | String | 投稿者メール |
| createdAt | String | 投稿日時 |
