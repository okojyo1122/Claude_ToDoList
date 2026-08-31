import fs from "node:fs";
import path from "node:path";

export interface OrgMember {
  name: string;
  asanaEmail?: string;
  role?: string;
}

export interface OrgTeam {
  name: string;
  members: OrgMember[];
}

export interface OrgGroup {
  name: string;
  teams: OrgTeam[];
}

export interface OrgDepartment {
  name: string;
  groups: OrgGroup[];
}

export interface OrgConfig {
  departments: OrgDepartment[];
}

const CONFIG_PATHS = [
  path.resolve(process.cwd(), "config/org.json"),
  path.resolve(process.cwd(), "config/org.example.json"),
];

export function loadOrg(): OrgConfig {
  for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as OrgConfig;
    }
  }
  return { departments: [] };
}

/** 組織階層をシステムプロンプトに埋め込むテキストに変換する */
export function orgToText(org: OrgConfig): string {
  if (org.departments.length === 0) {
    return "(組織構成は未設定です。config/org.json を作成してください)";
  }
  const lines: string[] = [];
  for (const dept of org.departments) {
    lines.push(`- 部: ${dept.name}`);
    for (const group of dept.groups) {
      lines.push(`  - グループ: ${group.name}`);
      for (const team of group.teams) {
        lines.push(`    - チーム: ${team.name}`);
        for (const m of team.members) {
          const email = m.asanaEmail ? ` <${m.asanaEmail}>` : "";
          const role = m.role ? `(${m.role})` : "";
          lines.push(`      - ${m.name}${role}${email}`);
        }
      }
    }
  }
  return lines.join("\n");
}
