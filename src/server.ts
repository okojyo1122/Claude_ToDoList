import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runChat,
  runOnce,
  type ChatEvent,
  type HistoryMessage,
} from "./claude.js";
import { loadOrg } from "./org.js";
import { findPersona, loadPersonas } from "./personas.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

// セッションごとの会話履歴(メモリ保持。再起動で消える)
const sessions = new Map<string, HistoryMessage[]>();
const MAX_HISTORY = 40;

interface Scope {
  department?: string;
  group?: string;
  team?: string;
  member?: string;
}

function scopeLabel(scope: Scope | undefined): string {
  if (!scope) return "指定なし(自分のタスク)";
  const parts = [scope.department, scope.group, scope.team, scope.member].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" > ") : "指定なし(自分のタスク)";
}

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date());
}

app.get("/api/org", (_req, res) => {
  res.json(loadOrg());
});

app.get("/api/personas", (_req, res) => {
  res.json(loadPersonas());
});

function personaContext(personaId: string | undefined): string {
  const p = findPersona(personaId);
  return `口調モード: ${p.id}(${p.label})`;
}

/** Claude の出力テキストから JSON オブジェクトを取り出す */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("応答から JSON を取得できませんでした");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// タスクボード用の構造化データを取得する
app.post("/api/board", async (req, res) => {
  const { scope, personaId } = req.body as { scope?: Scope; personaId?: string };
  const prompt = [
    `BOARD_JSON`,
    `[コンテキスト] 今日: ${todayInTokyo()} / 表示スコープ: ${scopeLabel(scope)} / ${personaContext(personaId)}`,
  ].join("\n");

  try {
    const text = await runOnce(prompt);
    res.json(extractJson(text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("board error:", err);
    res.status(500).json({ error: msg });
  }
});

// ボードのチェックボックスからタスクを完了にする
app.post("/api/complete", async (req, res) => {
  const { gid, name, personaId } = req.body as {
    gid?: string;
    name?: string;
    personaId?: string;
  };
  if (!gid || !name) {
    res.status(400).json({ error: "gid と name は必須です" });
    return;
  }
  const prompt = [
    `[コンテキスト] 今日: ${todayInTokyo()} / ${personaContext(personaId)}`,
    "---",
    `Asana のタスク「${name}」(gid: ${gid}) を完了にしてください。`,
    "完了できたら、口調モードに合った労い・褒めの一言だけを返してください(30〜60文字、Markdown不要)。",
    "失敗した場合は理由を短く伝えてください。",
  ].join("\n");

  try {
    const comment = (await runOnce(prompt)).trim();
    res.json({ ok: true, comment });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("complete error:", err);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, message, scope, personaId } = req.body as {
    sessionId?: string;
    message?: string;
    scope?: Scope;
    personaId?: string;
  };
  if (!sessionId || !message?.trim()) {
    res.status(400).json({ error: "sessionId と message は必須です" });
    return;
  }

  // NDJSON ストリーミングで返す
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (ev: ChatEvent) => {
    res.write(JSON.stringify(ev) + "\n");
  };

  const history = sessions.get(sessionId) ?? [];
  const contextualMessage = [
    `[コンテキスト] 今日: ${todayInTokyo()} / 表示スコープ: ${scopeLabel(scope)} / ${personaContext(personaId)}`,
    "---",
    message,
  ].join("\n");

  const userMsg: HistoryMessage = { role: "user", content: contextualMessage };

  try {
    const appended = await runChat([...history, userMsg], send);
    const newHistory = [...history, userMsg, ...appended].slice(-MAX_HISTORY);
    sessions.set(sessionId, newHistory);
    send({ type: "done" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("chat error:", err);
    send({ type: "error", message: msg });
    send({ type: "done" });
  } finally {
    res.end();
  }
});

app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (sessionId) sessions.delete(sessionId);
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`✅ タスク管理アプリ起動: http://localhost:${port}`);
});
