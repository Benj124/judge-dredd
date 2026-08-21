import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { getEmbedder, stubEmbed } from "./embed";
import { ingestWhaleDocumentsToRag } from "./ingestDocuments";
import { hybridRetrieve } from "./retrieve";

async function main() {
  await migrate();
  const forceStub =
    process.env.RAG_EMBED_STUB === "1" || process.env.EVAL_LLM_STUB === "1";
  const embed = forceStub ? stubEmbed : getEmbedder();
  const mode = forceStub ? "stub" : "live";

  process.stdout.write(
    `Chunking + embedding whale text_documents into rag_chunks (embed=${mode})…\n`,
  );

  const result = await ingestWhaleDocumentsToRag({ embed });
  for (const row of result.bySlug) {
    process.stdout.write(
      `  ${row.slug}: ${row.chunks} chunks → ${row.source}\n`,
    );
  }

  // Smoke retrieve when blue whale is present.
  const blue = result.bySlug.find((row) => row.slug === "blue-whale");
  let smoke: { query: string; hits: number; sample?: string } | null = null;
  if (blue) {
    const query = "blue whale largest animal baleen";
    const passages = await hybridRetrieve(query, { embed, limit: 5 });
    smoke = {
      query,
      hits: passages.length,
      sample: passages[0]
        ? `${passages[0].source ?? "?"} :: ${passages[0].text.slice(0, 120)}`
        : undefined,
    };
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
        smoke,
      },
      null,
      2,
    ) + "\n",
  );

  await closePool();
  if (result.chunks === 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
