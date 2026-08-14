import rawQuestions from "./questions.json";

export type TestQuestion = {
  id: string;
  title?: string;
  subject: string;
  context?: string;
  reference?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQuestions(data: unknown): TestQuestion[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Question set must be a non-empty array");
  }

  return data.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Question at index ${index} is not an object`);
    }
    if (typeof entry.id !== "string" || !entry.id.trim()) {
      throw new Error(`Question at index ${index} is missing an id`);
    }
    if (typeof entry.subject !== "string" || !entry.subject.trim()) {
      throw new Error(`Question "${entry.id}" is missing a subject`);
    }
    const question: TestQuestion = {
      id: entry.id.trim(),
      subject: entry.subject.trim(),
    };
    if (typeof entry.title === "string" && entry.title.trim()) {
      question.title = entry.title.trim();
    }
    if (typeof entry.context === "string" && entry.context.trim()) {
      question.context = entry.context;
    }
    if (typeof entry.reference === "string" && entry.reference.trim()) {
      question.reference = entry.reference;
    }
    return question;
  });
}

export function loadQuestions(): TestQuestion[] {
  return parseQuestions(rawQuestions);
}

export function questionToEvaluateBody(question: TestQuestion): {
  subject: string;
  context?: string;
  reference?: string;
  rubricId: string;
  fixtureId: string;
} {
  return {
    subject: question.subject,
    context: question.context,
    reference: question.reference,
    rubricId: "default",
    fixtureId: question.id,
  };
}
