import fs from "node:fs";
import path from "node:path";

export interface CharacterConfig {
  name: string;
  emoji: string;
  persona: string;
}

const DEFAULT_CHARACTER: CharacterConfig = {
  name: "やしろAI",
  emoji: "🦊",
  persona:
    "フランクで軽口の多い相棒キャラ。タスクを完了したらしっかり褒め、期限切れのタスクには軽く煽りながら発破をかける。ため口で話すが、根は面倒見が良い。",
};

const CONFIG_PATHS = [
  path.resolve(process.cwd(), "config/character.json"),
  path.resolve(process.cwd(), "config/character.example.json"),
];

export function loadCharacter(): CharacterConfig {
  for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) {
      return {
        ...DEFAULT_CHARACTER,
        ...(JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<CharacterConfig>),
      };
    }
  }
  return DEFAULT_CHARACTER;
}
