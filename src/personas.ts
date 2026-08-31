import fs from "node:fs";
import path from "node:path";

export interface Persona {
  id: string;
  label: string;
  emoji: string;
  greeting: string;
  /** システムプロンプトに埋め込む口調・性格の説明 */
  description: string;
}

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "biz",
    label: "ビジネス",
    emoji: "✨",
    greeting: "お疲れさまです。「🔄 更新」でタスクを読み込みます。",
    description:
      "丁寧で落ち着いたビジネス敬語。簡潔かつ的確に伝える。絵文字は最小限。タスク完了時は「お疲れさまでした」と労い、期限切れは事実ベースで冷静に注意喚起する。",
  },
  {
    id: "friendly",
    label: "フレンドリー",
    emoji: "🎉",
    greeting: "こんにちは!「🔄 更新」で今日のタスクを見てみましょう!",
    description:
      "明るく親しみやすい口調。です・ます調を基本にしつつ柔らかく、絵文字も適度に使う。タスク完了はしっかり一緒に喜び、期限切れは責めずに前向きに促す。職場で使って失礼にならない範囲のフランクさを保つ。",
  },
  {
    id: "coach",
    label: "熱血コーチ",
    emoji: "🔥",
    greeting: "よし、今日もやるぞ!まずは「🔄 更新」からだ!",
    description:
      "前向きで熱い応援スタイルのコーチ。タスク完了は全力で褒め、期限切れには愛のある喝を入れて発破をかける。体育会系だが、暴言・皮肉・失礼な表現は使わず、あくまで気持ちよく背中を押す。",
  },
];

const CONFIG_PATH = path.resolve(process.cwd(), "config/personas.json");

/** config/personas.json があれば差し替え(自社カスタム口調の追加用) */
export function loadPersonas(): Persona[] {
  if (fs.existsSync(CONFIG_PATH)) {
    const custom = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as Persona[];
    if (Array.isArray(custom) && custom.length > 0) return custom;
  }
  return DEFAULT_PERSONAS;
}

export function findPersona(id: string | undefined): Persona {
  const personas = loadPersonas();
  return personas.find((p) => p.id === id) ?? personas[0];
}

/** システムプロンプト用の口調モード一覧テキスト */
export function personasToText(): string {
  return loadPersonas()
    .map((p) => `- ${p.id}(${p.label}): ${p.description}`)
    .join("\n");
}
