import fs from "node:fs";
import path from "node:path";

/**
 * Asana MCP サーバ (V2) 用の OAuth トークン管理。
 *
 * - `npm run auth` (src/auth.ts) がブラウザ経由の認可フローでトークンを取得し、
 *   config/.asana-token.json に保存する。
 * - サーバはリクエストのたびに getAsanaToken() を呼び、期限切れが近ければ
 *   refresh_token で自動更新する(Asana のアクセストークンは短命のため)。
 * - .env の ASANA_MCP_TOKEN が設定されている場合はそれを優先する(手動運用向け)。
 */

export const ASANA_MCP_URL =
  process.env.ASANA_MCP_URL ?? "https://mcp.asana.com/v2/mcp";

const METADATA_URL = new URL(
  "/.well-known/oauth-authorization-server",
  ASANA_MCP_URL,
).toString();

const TOKEN_STORE_PATH = path.resolve(process.cwd(), "config/.asana-token.json");

export interface TokenStore {
  access_token: string;
  refresh_token?: string;
  /** epoch ミリ秒 */
  expires_at?: number;
  token_endpoint?: string;
}

export interface AuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  [key: string]: unknown;
}

export async function fetchAuthMetadata(): Promise<AuthServerMetadata> {
  const res = await fetch(METADATA_URL);
  if (!res.ok) {
    throw new Error(
      `OAuth メタデータの取得に失敗しました (${res.status}): ${METADATA_URL}`,
    );
  }
  const meta = (await res.json()) as AuthServerMetadata;
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    throw new Error("OAuth メタデータに必要なエンドポイントが含まれていません");
  }
  return meta;
}

export function readTokenStore(): TokenStore | null {
  if (!fs.existsSync(TOKEN_STORE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, "utf-8")) as TokenStore;
  } catch {
    return null;
  }
}

export function writeTokenStore(store: TokenStore): void {
  fs.mkdirSync(path.dirname(TOKEN_STORE_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

function clientCredentials(): { id: string; secret: string } {
  const id = process.env.ASANA_CLIENT_ID;
  const secret = process.env.ASANA_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "ASANA_CLIENT_ID / ASANA_CLIENT_SECRET が設定されていません。.env を確認してください。",
    );
  }
  return { id, secret };
}

export async function exchangeToken(
  tokenEndpoint: string,
  params: Record<string, string>,
): Promise<TokenStore> {
  const { id, secret } = clientCredentials();
  const body = new URLSearchParams({
    ...params,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(
      `トークンの取得に失敗しました (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  const expiresIn =
    typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    access_token: json.access_token,
    refresh_token:
      typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    token_endpoint: tokenEndpoint,
  };
}

/**
 * 有効な Asana MCP アクセストークンを返す。
 * 期限切れが近い場合は refresh_token で自動更新する。
 */
export async function getAsanaToken(): Promise<string> {
  // 手動設定を優先(トークンの自動更新は行わない)
  if (process.env.ASANA_MCP_TOKEN) return process.env.ASANA_MCP_TOKEN;

  const store = readTokenStore();
  if (!store) {
    throw new Error(
      "Asana の認証情報がありません。先に `npm run auth` を実行して Asana と連携してください。",
    );
  }

  const expiresSoon =
    store.expires_at !== undefined && store.expires_at - Date.now() < 60_000;
  if (!expiresSoon) return store.access_token;

  if (!store.refresh_token) {
    throw new Error(
      "Asana のトークンが期限切れです。`npm run auth` を再実行してください。",
    );
  }

  const tokenEndpoint =
    store.token_endpoint ?? (await fetchAuthMetadata()).token_endpoint;
  const refreshed = await exchangeToken(tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: store.refresh_token,
  });
  // 一部の実装では refresh 応答に refresh_token が含まれないため引き継ぐ
  refreshed.refresh_token = refreshed.refresh_token ?? store.refresh_token;
  writeTokenStore(refreshed);
  return refreshed.access_token;
}
