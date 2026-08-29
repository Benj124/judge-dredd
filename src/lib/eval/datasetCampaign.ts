import { listGoldItems, type DatasetItemRecord } from "../db/datasetObject";
import { runFixtureCampaign, type CampaignPersist, type FixtureCampaign } from "./campaign";
import { formatFactsAsReference } from "./datasetIo";
import { generateJudgedText } from "./generate";
import type { TestQuestion } from "./questions";
import type { JudgeComplete } from "./types";

export type GenerateSubject = (input: {
  context?: string;
  subject: string;
}) => Promise<string>;

export function goldItemToQuestionFields(item: DatasetItemRecord): {
  context: string;
  reference: string;
} {
  return {
    context: item.question.trim(),
    reference: formatFactsAsReference(item.expectedFacts),
  };
}

export async function goldItemsToCampaignQuestions(
  items: DatasetItemRecord[],
  generate: GenerateSubject,
): Promise<TestQuestion[]> {
  const gold = items.filter((item) => item.isGold);
  if (gold.length === 0) {
    throw new Error("No gold items to run as a campaign");
  }
  const questions: TestQuestion[] = [];
  for (const item of gold) {
    const { context, reference } = goldItemToQuestionFields(item);
    const subject = (await generate({ context, subject: "" })).trim();
    if (!subject) {
      throw new Error(`Generator returned empty subject for item ${item.id}`);
    }
    const question: TestQuestion = {
      id: item.id,
      subject,
      context,
    };
    if (reference) question.reference = reference;
    if (item.difficulty) question.title = item.difficulty;
    questions.push(question);
  }
  return questions;
}

export async function runGoldDatasetCampaign(options: {
  versionId: string;
  complete: JudgeComplete;
  generate: GenerateSubject;
  persist?: CampaignPersist;
  seed?: string;
  modelId?: string;
}): Promise<FixtureCampaign> {
  const versionId = options.versionId.trim();
  if (!versionId) {
    throw new Error("versionId is required");
  }
  const items = await listGoldItems(versionId);
  const questions = await goldItemsToCampaignQuestions(items, options.generate);
  return runFixtureCampaign(questions, options.complete, {
    persist: options.persist,
    seed: options.seed,
    modelId: options.modelId,
    datasetVersion: versionId,
  });
}

export function generateSubjectFromComplete(
  complete: JudgeComplete,
  model: string,
): GenerateSubject {
  return async ({ context, subject }) =>
    generateJudgedText({ context, subject: subject ?? "" }, complete, model);
}
