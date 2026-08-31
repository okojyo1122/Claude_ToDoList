import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import {
  exchangeToken,
  fetchAuthMetadata,
  writeTokenStore,
} from "./asanaAuth.js";

/**
 * Asana MCP サーバ (V2) の OAuth 認可フロー (Authorization Code + PKCE)。
 *
 * 使い方: npm run auth
 *   1. 表示された URL をブラウザで開く
 *   2. Asana にログインしてワークスペースを選び「許可」
 *   3. トークンが config/.asana-token.json に保存される
 *
 * 事前に Asana 開発者コンソールで「MCPアプリ」を作成し、
 * .env に ASANA_CLIENT_ID / ASANA_CLIENT_SECRET を設定しておくこと。
 * リダイレクト URL には http://localhost:8787/oauth/callback を登録する。
 */

const CALLBACK_PORT = Number(process.env.ASANA_OAUTH_CALLBACK_PORT ?? 8787);
const REDIRECT_URI =
  process.env.ASANA_OAUTH_REDIRECT_URI ??
  `http://localhost:${CALLBACK_PORT}/oauth/callback`;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

async function main() {
  if (!process.env.ASANA_CLIENT_ID || !process.env.ASANA_CLIENT_SECRET) {
    console.error(
      "❌ ASANA_CLIENT_ID / ASANA_CLIENT_SECRET が設定されていません。\n" +
        "   Asana 開発者コンソール (https://app.asana.com/0/developer-console) で\n" +
        "   MCPアプリを作成し、.env に設定してください。手順は SETUP.md を参照。",
    );
    process.exit(1);
  }

  console.log("🔎 Asana MCP サーバの OAuth 設定を取得中…");
  const meta = await fetchAuthMetadata();

  const state = b64url(crypto.randomBytes(16));
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );

  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.ASANA_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== new URL(REDIRECT_URI).pathname) {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const authCode = url.searchParams.get("code");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (err || !authCode || returnedState !== state) {
        res.end("<h2>❌ 認証に失敗しました。ターミナルを確認してください。</h2>");
        server.close();
        reject(new Error(err ?? "認可コードを取得できませんでした"));
        return;
      }
      res.end(
        "<h2>✅ Asana との連携が完了しました。このタブは閉じて構いません。</h2>",
      );
      server.close();
      resolve(authCode);
    });

    server.listen(CALLBACK_PORT, () => {
      console.log("\n👇 次の URL をブラウザで開いて、Asana へのアクセスを許可してください:\n");
      console.log(`   ${authUrl.toString()}\n`);
      console.log(`(コールバック待機中: ${REDIRECT_URI})`);
    });
    server.on("error", reject);
  });

  console.log("🔁 認可コードをトークンに交換中…");
  const store = await exchangeToken(meta.token_endpoint, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  writeTokenStore(store);

  console.log("✅ トークンを config/.asana-token.json に保存しました。");
  console.log("   このままアプリを起動できます: npm run dev");
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
