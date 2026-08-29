import type { Pool } from "pg";
import {
  BUILTIN_SYNTHESIS_TEMPLATES,
  isSynthesisMode,
  type SynthesisMode,
  type SynthesisTemplate,
} from "../graph/synthModes";
import { getPool } from "./pool";

type TemplateRow = {
  id: string;
  version: string;
  mode: string;
  name: string;
  body: string;
};

function mapRow(row: TemplateRow): SynthesisTemplate {
  if (!isSynthesisMode(row.mode)) {
    throw new Error(`Stored template "${row.id}@${row.version}" has invalid mode`);
  }
  return {
    id: row.id,
    version: row.version,
    mode: row.mode,
    name: row.name,
    body: row.body,
  };
}

export async function saveSynthesisTemplate(
  template: SynthesisTemplate,
  pool: Pool = getPool(),
): Promise<SynthesisTemplate> {
  const id = template.id.trim();
  const version = template.version.trim();
  const name = template.name.trim();
  const body = template.body.trim();
  if (!id) throw new Error("template id is required");
  if (!version) throw new Error("template version is required");
  if (!name) throw new Error("template name is required");
  if (!body) throw new Error("template body is required");
  if (!isSynthesisMode(template.mode)) {
    throw new Error(`Unknown synthesis mode "${template.mode}"`);
  }
  await pool.query(
    `INSERT INTO synthesis_templates (id, version, mode, name, body, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id, version) DO UPDATE SET
       mode = EXCLUDED.mode,
       name = EXCLUDED.name,
       body = EXCLUDED.body,
       updated_at = now()`,
    [id, version, template.mode, name, body],
  );
  return { id, version, mode: template.mode, name, body };
}

export async function getSynthesisTemplate(
  id: string,
  version = "1",
  pool: Pool = getPool(),
): Promise<SynthesisTemplate | null> {
  const result = await pool.query<TemplateRow>(
    `SELECT id, version, mode, name, body
     FROM synthesis_templates
     WHERE id = $1 AND version = $2`,
    [id.trim(), version.trim()],
  );
  if (result.rows.length > 0) {
    return mapRow(result.rows[0]);
  }
  return (
    BUILTIN_SYNTHESIS_TEMPLATES.find(
      (template) => template.id === id.trim() && template.version === version.trim(),
    ) ?? null
  );
}

export async function getSynthesisTemplateByMode(
  mode: SynthesisMode,
  pool: Pool = getPool(),
): Promise<SynthesisTemplate> {
  const result = await pool.query<TemplateRow>(
    `SELECT id, version, mode, name, body
     FROM synthesis_templates
     WHERE mode = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [mode],
  );
  if (result.rows.length > 0) {
    return mapRow(result.rows[0]);
  }
  const builtin = BUILTIN_SYNTHESIS_TEMPLATES.find((template) => template.mode === mode);
  if (!builtin) {
    throw new Error(`No template for mode "${mode}"`);
  }
  return builtin;
}

export async function listSynthesisTemplates(
  pool: Pool = getPool(),
): Promise<SynthesisTemplate[]> {
  const result = await pool.query<TemplateRow>(
    `SELECT id, version, mode, name, body
     FROM synthesis_templates
     ORDER BY mode, id, version`,
  );
  const stored = result.rows.map(mapRow);
  const keys = new Set(stored.map((row) => `${row.id}@${row.version}`));
  const builtins = BUILTIN_SYNTHESIS_TEMPLATES.filter(
    (template) => !keys.has(`${template.id}@${template.version}`),
  );
  return [...builtins, ...stored];
}
