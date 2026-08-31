"use strict";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const todayEl = document.getElementById("today");

const sessionId =
  sessionStorage.getItem("sessionId") ??
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
sessionStorage.setItem("sessionId", sessionId);

todayEl.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

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

// ---- チャット描画 ----
function renderMarkdown(el, text) {
  const html = DOMPurify.sanitize(marked.parse(text));
  el.innerHTML = html;
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

// ---- 送信 ----
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
      body: JSON.stringify({ sessionId, message, scope: getScope() }),
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
  inputEl.style.height = Math.min(inputEl.scrollHeight, 240) + "px";
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

document.getElementById("btn-reset").addEventListener("click", async () => {
  await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  chatEl.innerHTML = "";
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "会話をリセットしました。";
  msg.appendChild(bubble);
  chatEl.appendChild(msg);
});
