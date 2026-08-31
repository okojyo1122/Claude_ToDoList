"use strict";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const todayEl = document.getElementById("today");
const mascotEl = document.getElementById("mascot");
const speechEl = document.getElementById("speech");
const boardStatusEl = document.getElementById("board-status");
const miniMascotEl = document.getElementById("mini-mascot");

const sessionId =
  sessionStorage.getItem("sessionId") ??
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
sessionStorage.setItem("sessionId", sessionId);

todayEl.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

// ---- キャラクター(Claude)と口調モード ----
let personas = [];
const personaSel = document.getElementById("sel-persona");

function currentPersona() {
  return (
    personas.find((p) => p.id === personaSel.value) ??
    personas[0] ?? { id: "biz", label: "ビジネス", emoji: "✨", greeting: "" }
  );
}

function say(text, mood) {
  speechEl.textContent = text;
  mascotEl.classList.remove("happy", "annoyed", "excited");
  if (mood) mascotEl.classList.add(mood);
}

function celebrate() {
  mascotEl.classList.add("excited");
  setTimeout(() => mascotEl.classList.remove("excited"), 1600);
  miniMascotEl.textContent = currentPersona().emoji || "🎉";
  miniMascotEl.hidden = false;
  miniMascotEl.classList.remove("run");
  void miniMascotEl.offsetWidth; // アニメーション再トリガー
  miniMascotEl.classList.add("run");
}

function addWelcome() {
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  renderMarkdown(
    bubble,
    [
      "こんにちは!タスク管理アシスタントの **Claude** です。",
      "- 「**今日のタスク教えて**」で今日やることを表示",
      "- **議事録ややったこと**を貼ると Asana に自動反映",
      "- 上のセレクタで **部 / グループ / チーム / 人** を切替",
      "- キャラクター横のセレクタで**口調**を変更できます",
    ].join("\n"),
  );
  msg.appendChild(bubble);
  chatEl.appendChild(msg);
}

fetch("/api/personas")
  .then((r) => r.json())
  .then((list) => {
    personas = list;
    personaSel.innerHTML = "";
    for (const p of personas) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.emoji} ${p.label}`;
      personaSel.appendChild(o);
    }
    let saved = null;
    try { saved = localStorage.getItem("personaId"); } catch {}
    if (saved && personas.some((p) => p.id === saved)) {
      personaSel.value = saved;
    }
    say(currentPersona().greeting || "「🔄 更新」でタスクを読み込みます。");
    addWelcome();
  })
  .catch(() => {
    say("口調設定の読み込みに失敗しました。");
    addWelcome();
  });

personaSel.addEventListener("change", () => {
  try { localStorage.setItem("personaId", personaSel.value); } catch {}
  say(currentPersona().greeting || "口調を切り替えました。");
});

// ---- 組織スコープセレクタ ----
let org = { departments: [] };
const selDept = document.getElementById("sel-dept");
const selGroup = document.getElementById("sel-group");
const selTeam = document.getElementById("sel-team");
const selMember = document.getElementById("sel-member");

function fillSelect(sel, label, names) {
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = label + ": すべて";
  sel.appendChild(opt);
  for (const name of names) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  }
}

function currentDept() {
  return org.departments.find((d) => d.name === selDept.value);
}
function currentGroup() {
  return currentDept()?.groups.find((g) => g.name === selGroup.value);
}
function currentTeam() {
  return currentGroup()?.teams.find((t) => t.name === selTeam.value);
}

function refreshScopeSelects() {
  const dept = currentDept();
  const groups = dept ? dept.groups : org.departments.flatMap((d) => d.groups);
  fillSelect(selGroup, "グループ", groups.map((g) => g.name));

  const group = currentGroup();
  const teams = group ? group.teams : groups.flatMap((g) => g.teams);
  fillSelect(selTeam, "チーム", teams.map((t) => t.name));

  const team = currentTeam();
  const members = team ? team.members : teams.flatMap((t) => t.members);
  fillSelect(selMember, "人", members.map((m) => m.name));
}

selDept.addEventListener("change", () => { selGroup.value = ""; selTeam.value = ""; selMember.value = ""; refreshScopeSelects(); });
selGroup.addEventListener("change", () => { selTeam.value = ""; selMember.value = ""; refreshScopeSelects(); });
selTeam.addEventListener("change", () => { selMember.value = ""; refreshScopeSelects(); });

fetch("/api/org")
  .then((r) => r.json())
  .then((data) => {
    org = data;
    fillSelect(selDept, "部", org.departments.map((d) => d.name));
    refreshScopeSelects();
  })
  .catch(() => {});

function getScope() {
  return {
    department: selDept.value || undefined,
    group: selGroup.value || undefined,
    team: selTeam.value || undefined,
    member: selMember.value || undefined,
  };
}

// ---- タスクボード ----
const columns = {
  overdue: document.getElementById("col-overdue"),
  today: document.getElementById("col-today"),
  upcoming: document.getElementById("col-upcoming"),
  done: document.getElementById("col-done"),
};
const doneCountEl = document.getElementById("done-count");
let boardLoading = false;

function fmtDue(due) {
  if (!due) return null;
  const [y, m, d] = due.split("-").map(Number);
  return `${m}/${d}`;
}

function makeCard(task) {
  const card = document.createElement("div");
  card.className = "card" + (task.status === "done" ? " done" : "");

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = task.status === "done";
  check.disabled = task.status === "done";
  check.addEventListener("change", () => completeTask(task, card, check));

  const body = document.createElement("div");
  body.className = "card-body";
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = task.name;
  const meta = document.createElement("div");
  meta.className = "card-meta";
  if (task.assignee) {
    const s = document.createElement("span");
    s.textContent = `👤 ${task.assignee}`;
    meta.appendChild(s);
  }
  const due = fmtDue(task.due_on);
  if (due) {
    const s = document.createElement("span");
    s.textContent = `⏰ ${due}`;
    if (task.status === "overdue") s.className = "overdue";
    meta.appendChild(s);
  }
  if (task.project) {
    const s = document.createElement("span");
    s.textContent = `📁 ${task.project}`;
    meta.appendChild(s);
  }
  body.appendChild(name);
  body.appendChild(meta);
  card.appendChild(check);
  card.appendChild(body);
  return card;
}

function renderBoard(tasks) {
  for (const col of Object.values(columns)) col.innerHTML = "";
  let doneCount = 0;
  for (const task of tasks) {
    const col = columns[task.status] ?? columns.upcoming;
    if (task.status === "done") doneCount++;
    col.appendChild(makeCard(task));
  }
  doneCountEl.textContent = String(doneCount);
  for (const [status, col] of Object.entries(columns)) {
    if (status !== "done" && col.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card-meta";
      empty.style.padding = "4px";
      empty.textContent = "なし 🎉";
      col.appendChild(empty);
    }
  }
}

async function loadBoard() {
  if (boardLoading) return;
  boardLoading = true;
  boardStatusEl.textContent = "Asana からタスクを読み込み中…(数十秒かかることがあります)";
  boardStatusEl.classList.add("loading");
  say("Asana からタスクを読み込んでいます…");

  try {
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: getScope(), personaId: personaSel.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `サーバエラー (${res.status})`);

    renderBoard(Array.isArray(data.tasks) ? data.tasks : []);
    const overdue = (data.tasks || []).filter((t) => t.status === "overdue").length;
    say(
      data.comment ||
        (overdue > 0
          ? `期限切れが ${overdue} 件あります。`
          : "今日も一日がんばりましょう。"),
      overdue > 0 ? "annoyed" : "happy",
    );
    boardStatusEl.textContent = `最終更新: ${new Date().toLocaleTimeString("ja-JP")}`;
  } catch (err) {
    boardStatusEl.textContent = `読み込み失敗: ${err.message}`;
    say("Asana に接続できませんでした。設定をご確認ください。", "annoyed");
  } finally {
    boardStatusEl.classList.remove("loading");
    boardLoading = false;
  }
}

async function completeTask(task, card, check) {
  check.disabled = true;
  card.classList.add("completing");
  say(`「${task.name}」を完了として Asana に反映中…`);

  try {
    const res = await fetch("/api/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gid: task.gid,
        name: task.name,
        personaId: personaSel.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `サーバエラー (${res.status})`);

    card.classList.remove("completing");
    card.classList.add("done");
    columns.done.appendChild(card);
    doneCountEl.textContent = String(Number(doneCountEl.textContent) + 1);
    say(data.comment || "完了しました。お疲れさまでした!", "happy");
    celebrate();
  } catch (err) {
    check.checked = false;
    check.disabled = false;
    card.classList.remove("completing");
    say(`反映に失敗しました… (${err.message})`, "annoyed");
  }
}

document.getElementById("btn-refresh").addEventListener("click", loadBoard);

// ---- チャット描画 ----
function renderMarkdown(el, text) {
  if (window.marked && window.DOMPurify) {
    el.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else {
    // CDN が使えない環境ではプレーンテキストで表示する
    el.textContent = text;
  }
}

function addUserMessage(text) {
  const msg = document.createElement("div");
  msg.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  msg.appendChild(bubble);
  chatEl.appendChild(msg);
  scrollBottom();
}

function addAssistantBubble() {
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = '<span class="typing">考えています…</span>';
  msg.appendChild(bubble);
  chatEl.appendChild(msg);
  scrollBottom();
  return bubble;
}

function scrollBottom() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ---- チャット送信 ----
let busy = false;

async function send(message) {
  if (busy || !message.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  addUserMessage(message);
  const bubble = addAssistantBubble();

  let text = "";
  let statusEl = null;

  const showStatus = (label) => {
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "tool-status";
      bubble.parentElement.insertBefore(statusEl, bubble);
    }
    statusEl.textContent = label;
  };
  const clearStatus = () => {
    statusEl?.remove();
    statusEl = null;
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        scope: getScope(),
        personaId: personaSel.value,
      }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `サーバエラー (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "text") {
          text += ev.delta;
          renderMarkdown(bubble, text);
          scrollBottom();
        } else if (ev.type === "tool") {
          showStatus(`Asana を操作中: ${ev.name}`);
        } else if (ev.type === "error") {
          text += `\n\n**⚠️ エラー:** ${ev.message}`;
          renderMarkdown(bubble, text);
        }
      }
    }
  } catch (err) {
    text += `\n\n**⚠️ エラー:** ${err.message}`;
    renderMarkdown(bubble, text || "エラーが発生しました");
  } finally {
    clearStatus();
    if (!text.trim()) {
      bubble.innerHTML = '<span class="typing">(応答がありませんでした)</span>';
    }
    busy = false;
    sendBtn.disabled = false;
    scrollBottom();
  }
}

sendBtn.addEventListener("click", () => {
  const v = inputEl.value;
  inputEl.value = "";
  autoGrow();
  send(v);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendBtn.click();
  }
});

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
}
inputEl.addEventListener("input", autoGrow);

// クイックアクション
document.querySelectorAll(".quick[data-prompt]").forEach((btn) => {
  btn.addEventListener("click", () => send(btn.dataset.prompt));
});

document.getElementById("btn-minutes").addEventListener("click", () => {
  inputEl.value =
    "以下の議事録を分析して、タスクの追加・完了を Asana に反映してください:\n\n";
  autoGrow();
  inputEl.focus();
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
});

// デバッグ・動作確認用に公開
window.renderBoard = renderBoard;
window.say = say;

document.getElementById("btn-reset").addEventListener("click", async () => {
  await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  chatEl.innerHTML = "";
  say("会話をリセットしました。");
});
