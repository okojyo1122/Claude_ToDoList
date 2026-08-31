import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompts.js";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";
const ASANA_MCP_URL = process.env.ASANA_MCP_URL ?? "https://mcp.asana.com/sse";

const BETAS = ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        "ANTHROPIC_API_KEY が設定されていません。.env を確認してください。",
      );
    }
    _client = new Anthropic();
  }
  return _client;
}

const systemPrompt = buildSystemPrompt();

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type HistoryMessage = Anthropic.Beta.BetaMessageParam;

function requireAsanaToken(): string {
  const token = process.env.ASANA_MCP_TOKEN;
  if (!token) {
    throw new Error(
      "ASANA_MCP_TOKEN が設定されていません。Asana の OAuth アクセストークンを .env に設定してください。",
    );
  }
  return token;
}

function baseRequest(asanaToken: string) {
  return {
    model: MODEL,
    max_tokens: 16000 as const,
    betas: BETAS,
    fallbacks: "default" as const,
    system: [
      {
        type: "text" as const,
        text: systemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    mcp_servers: [
      {
        type: "url" as const,
        url: ASANA_MCP_URL,
        name: "asana",
        authorization_token: asanaToken,
      },
    ],
    tools: [{ type: "mcp_toolset" as const, mcp_server_name: "asana" }],
  };
}

/**
 * 単発のリクエストを実行し、最終テキストを返す(履歴なし・非ストリーミング用途)。
 * タスクボードの JSON 取得などに使う。pause_turn は継続する。
 */
export async function runOnce(promptText: string): Promise<string> {
  const asanaToken = requireAsanaToken();
  const messages: HistoryMessage[] = [{ role: "user", content: promptText }];

  for (let turn = 0; turn < 10; turn++) {
    const stream = client().beta.messages.stream({
      ...baseRequest(asanaToken),
      messages,
    });
    const response = await stream.finalMessage();
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      throw new Error("リクエストが安全上の理由で拒否されました。");
    }
    if (response.stop_reason !== "pause_turn") {
      break;
    }
  }

  const last = messages[messages.length - 1];
  if (last.role !== "assistant" || typeof last.content === "string") {
    return typeof last.content === "string" ? last.content : "";
  }
  return last.content
    .filter(
      (b): b is Anthropic.Beta.BetaTextBlock =>
        typeof b === "object" && "type" in b && b.type === "text",
    )
    .map((b) => b.text)
    .join("");
}

/**
 * 会話履歴 + 新規ユーザーメッセージで Claude を呼び出す。
 * Asana MCP サーバへの接続は Anthropic 側(MCP コネクタ)で行われるため、
 * ツール実行ループをこちらで書く必要はない。
 * pause_turn で止まった場合は続きを要求する。
 *
 * 戻り値: 履歴に追加すべき assistant メッセージ群。
 */
export async function runChat(
  history: HistoryMessage[],
  onEvent: (ev: ChatEvent) => void,
): Promise<HistoryMessage[]> {
  const asanaToken = requireAsanaToken();
  const messages: HistoryMessage[] = [...history];
  const appended: HistoryMessage[] = [];

  // pause_turn(長いツール実行フロー)対応: 最大10回まで継続する
  for (let turn = 0; turn < 10; turn++) {
    const stream = client().beta.messages.stream({
      ...baseRequest(asanaToken),
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "mcp_tool_use") {
          onEvent({ type: "tool", name: block.name });
        }
      } else if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onEvent({ type: "text", delta: event.delta.text });
      }
    }

    const response = await stream.finalMessage();
    const assistantMsg: HistoryMessage = {
      role: "assistant",
      content: response.content,
    };
    messages.push(assistantMsg);
    appended.push(assistantMsg);

    if (response.stop_reason === "refusal") {
      onEvent({
        type: "error",
        message: "リクエストが安全上の理由で拒否されました。",
      });
      break;
    }
    if (response.stop_reason !== "pause_turn") {
      break;
    }
    // pause_turn の場合はそのまま同じ履歴で継続リクエストする
  }

  return appended;
}
