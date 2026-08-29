import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { getEmbedder, stubEmbed } from "./embed";
import { ingestStoredDocumentsToRag } from "./ingestDocuments";

function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function main() {
  await migrate();
  const forceStub =
    process.env.RAG_EMBED_STUB === "1" || process.env.EVAL_LLM_STUB === "1";
  const embed = forceStub ? stubEmbed : getEmbedder();
  const mode = forceStub ? "stub" : "live";
  const slugArg = argValue("--slug");
  const slugs = slugArg
    ? slugArg.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  process.stdout.write(
    `Chunking + embedding text_documents into rag_chunks (embed=${mode})…\n`,
  );

  const result = await ingestStoredDocumentsToRag({ embed, slugs });
  for (const row of result.bySlug) {
    process.stdout.write(`  ${row.slug}: ${row.chunks} chunks → ${row.source}\n`);
  }
  process.stdout.write(
    JSON.stringify(
      {
        embed: mode,
        documents: result.documents,
        chunks: result.chunks,
        deleted: result.deleted,
        sources: result.sources,
        bySlug: result.bySlug,
      },
      null,
      2,
    ) + "\n",
  );
  if (result.chunks === 0) process.exitCode = 1;
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
