import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChat, type ChatEvent, type HistoryMessage } from "./claude.js";
import { loadOrg } from "./org.js";

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

app.post("/api/chat", async (req, res) => {
  const { sessionId, message, scope } = req.body as {
    sessionId?: string;
    message?: string;
    scope?: Scope;
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
    `[コンテキスト] 今日: ${todayInTokyo()} / 表示スコープ: ${scopeLabel(scope)}`,
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
