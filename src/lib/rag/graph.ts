import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { EmbedFn } from "./embed";
import { hybridRetrieve, type Passage } from "./retrieve";

const RagState = Annotation.Root({
  query: Annotation<string>,
  passages: Annotation<Passage[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
});

export function buildRetrieveGraph(embed: EmbedFn) {
  return new StateGraph(RagState)
    .addNode("retrieve", async (state) => ({
      passages: await hybridRetrieve(state.query, { embed }),
    }))
    .addEdge(START, "retrieve")
    .addEdge("retrieve", END)
    .compile();
}

export async function runRetrieveGraph(
  query: string,
  embed: EmbedFn,
): Promise<Passage[]> {
  const app = buildRetrieveGraph(embed);
  const result = await app.invoke({ query });
  return result.passages;
}
