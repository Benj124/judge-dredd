export const SYNTHESIS_MODES = [
  "grounded_qa",
  "multi_hop",
  "unanswerable",
  "adversarial_paraphrase",
  "distractor_facts",
  "retrieval_gold",
] as const;

export type SynthesisMode = (typeof SYNTHESIS_MODES)[number];

export type DifficultyMix = {
  easy: number;
  medium: number;
  hard: number;
};

export type SynthesisTemplate = {
  id: string;
  version: string;
  mode: SynthesisMode;
  name: string;
  body: string;
};

export const DEFAULT_N_PER_DOC = 5;

export const DEFAULT_DIFFICULTY_MIX: DifficultyMix = {
  easy: 2,
  medium: 2,
  hard: 1,
};

export function isSynthesisMode(value: string): value is SynthesisMode {
  return (SYNTHESIS_MODES as readonly string[]).includes(value);
}

export function parseDifficultyMix(input: unknown): DifficultyMix {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_DIFFICULTY_MIX };
  }
  const record = input as Record<string, unknown>;
  const num = (key: string) => {
    const raw = record[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const mix = {
    easy: num("easy"),
    medium: num("medium"),
    hard: num("hard"),
  };
  if (mix.easy + mix.medium + mix.hard === 0) {
    return { ...DEFAULT_DIFFICULTY_MIX };
  }
  return mix;
}

export function formatDifficultyMix(mix: DifficultyMix): string {
  return `easy:${mix.easy}, medium:${mix.medium}, hard:${mix.hard}`;
}

export function countDifficultyMix(
  questions: Array<{ difficulty?: string }>,
): DifficultyMix {
  const mix: DifficultyMix = { easy: 0, medium: 0, hard: 0 };
  for (const question of questions) {
    const key = question.difficulty?.trim().toLowerCase();
    if (key === "easy" || key === "medium" || key === "hard") {
      mix[key] += 1;
    }
  }
  return mix;
}

const JSON_SHAPE = `Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["..."],"difficulty":"medium"}]}`;

export const BUILTIN_SYNTHESIS_TEMPLATES: SynthesisTemplate[] = [
  {
    id: "grounded-qa",
    version: "1",
    mode: "grounded_qa",
    name: "Grounded QA",
    body: `You generate GROUNDED evaluation questions for an LLM judge (mode=grounded_qa).

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce {{n}} grounded questions. Difficulty mix: {{difficulty_mix}}.
Each question must be answerable only from the article.
For each include question, expected_facts (short bullets from the article), difficulty (easy|medium|hard), mode "grounded_qa".
${JSON_SHAPE}`,
  },
  {
    id: "multi-hop",
    version: "1",
    mode: "multi_hop",
    name: "Multi-hop (2+ docs)",
    body: `You generate MULTI-HOP evaluation questions (mode=multi_hop). Each question MUST require facts from at least TWO of the documents below — not answerable from one document alone.

{{docs}}

Produce {{n}} multi-hop questions. Difficulty mix: {{difficulty_mix}}.
For each include question, expected_facts (bullets citing more than one doc), difficulty, mode "multi_hop", and source_slugs (array of the slugs used).
Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["..."],"difficulty":"hard","mode":"multi_hop","source_slugs":["slug-a","slug-b"]}]}`,
  },
  {
    id: "unanswerable",
    version: "1",
    mode: "unanswerable",
    name: "Unanswerable / abstain",
    body: `You generate UNANSWERABLE evaluation questions (mode=unanswerable) to test abstention/hallucination.

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce {{n}} questions that LOOK related to the article but CANNOT be answered from it (missing dates, other entities, invented stats). Difficulty mix: {{difficulty_mix}}.
Set unanswerable to true. expected_facts should state that the article does not contain the answer.
Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["Not stated in the source."],"difficulty":"medium","mode":"unanswerable","unanswerable":true}]}`,
  },
  {
    id: "adversarial-paraphrase",
    version: "1",
    mode: "adversarial_paraphrase",
    name: "Adversarial paraphrase",
    body: `You generate ADVERSARIAL PARAPHRASE evaluation questions (mode=adversarial_paraphrase) for robustness.

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce {{n}} questions that ask about real article facts but use paraphrase, distractor wording, or slightly misleading framing. Difficulty mix: {{difficulty_mix}}.
expected_facts must still be the true article facts. Include mode "adversarial_paraphrase".
${JSON_SHAPE}`,
  },
  {
    id: "distractor-facts",
    version: "1",
    mode: "distractor_facts",
    name: "Negative / distractor facts",
    body: `You generate questions with DISTRACTOR (false) facts (mode=distractor_facts) as traps for judges and models.

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce {{n}} questions. Difficulty mix: {{difficulty_mix}}.
For each: question, expected_facts (TRUE bullets from the article), distractors (FALSE but plausible bullets NOT supported by the article), difficulty, mode "distractor_facts".
Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["true fact"],"distractors":["false trap"],"difficulty":"medium","mode":"distractor_facts"}]}`,
  },
  {
    id: "retrieval-gold",
    version: "1",
    mode: "retrieval_gold",
    name: "Retrieval gold",
    body: `You generate RETRIEVAL-GOLD evaluation items (mode=retrieval_gold). Each item is a question plus the passages that SHOULD be retrieved.

Article title: {{title}}
Source URL: {{url}}

Article full text:
{{full_text}}

Produce {{n}} questions. Difficulty mix: {{difficulty_mix}}.
For each include question, expected_facts, difficulty, mode "retrieval_gold", and expected_retrieved_context: array of { "doc_uri": source URL, "content": short verbatim-or-close span from the article }.
Reply with JSON only:
{"questions":[{"question":"...","expected_facts":["..."],"difficulty":"medium","mode":"retrieval_gold","expected_retrieved_context":[{"doc_uri":"{{url}}","content":"..."}]}]}`,
  },
];

export function getBuiltinTemplate(
  modeOrId: string,
  version = "1",
): SynthesisTemplate | undefined {
  return BUILTIN_SYNTHESIS_TEMPLATES.find(
    (template) =>
      (template.mode === modeOrId || template.id === modeOrId) &&
      template.version === version,
  );
}

export function templateForMode(mode: SynthesisMode): SynthesisTemplate {
  const found = getBuiltinTemplate(mode);
  if (!found) {
    throw new Error(`No built-in template for mode "${mode}"`);
  }
  return found;
}

export type PromptDoc = {
  slug?: string;
  title: string;
  canonicalUrl: string;
  fullText: string;
};

export function formatDocsBlock(docs: PromptDoc[]): string {
  return docs
    .map((doc, index) => {
      const slug = doc.slug ? ` slug=${doc.slug}` : "";
      return `### Doc ${index + 1}${slug}: ${doc.title}\nSource URL: ${doc.canonicalUrl}\n\n${doc.fullText}`;
    })
    .join("\n\n");
}

export function fillModeTemplate(
  template: string,
  input: {
    docs: PromptDoc[];
    n: number;
    difficultyMix: DifficultyMix;
  },
): string {
  const primary = input.docs[0];
  if (!primary) {
    throw new Error("At least one document is required to fill a synthesis template");
  }
  return template
    .replaceAll("{{title}}", primary.title)
    .replaceAll("{{url}}", primary.canonicalUrl)
    .replaceAll("{{full_text}}", primary.fullText)
    .replaceAll("{{docs}}", formatDocsBlock(input.docs))
    .replaceAll("{{n}}", String(input.n))
    .replaceAll("{{difficulty_mix}}", formatDifficultyMix(input.difficultyMix));
}

export function systemPromptForMode(mode: SynthesisMode): string {
  const prefix =
    mode === "multi_hop"
      ? "You synthesize multi-hop evaluation questions that require two or more source documents. "
      : mode === "unanswerable"
        ? "You synthesize unanswerable evaluation questions to test abstention. "
        : mode === "adversarial_paraphrase"
          ? "You synthesize adversarially paraphrased evaluation questions. "
          : mode === "distractor_facts"
            ? "You synthesize evaluation questions that include false distractor facts. "
            : mode === "retrieval_gold"
              ? "You synthesize retrieval-gold evaluation items with expected retrieved passages. "
              : "You synthesize grounded evaluation questions from a single source article. ";
  return (
    prefix +
    "Follow the user instructions exactly. Reply with JSON only — no markdown fences, no prose outside JSON."
  );
}
