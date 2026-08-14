export type Scale = {
  min: number;
  max: number;
};

export type Criterion = {
  id: string;
  name: string;
  description: string;
  scale: Scale;
  weight: number;
  passThreshold?: number;
};

export type OverallPassRule = "all_must_pass" | "weighted_average";

export type Rubric = {
  id: string;
  version: string;
  name: string;
  description: string;
  criteria: Criterion[];
  overallPassRule: OverallPassRule;
  overallPassThreshold?: number;
};

export type EvaluateJob = {
  subject: string;
  context?: string;
  reference?: string;
  rubric: Rubric;
};

export type CriterionScore = {
  id: string;
  score: number;
  rationale?: string;
};

export type RetrievedPassage = {
  id: string;
  text: string;
  score: number;
  source?: string | null;
};

export type Verdict = {
  rubricId: string;
  rubricVersion: string;
  scores: CriterionScore[];
  overall: number;
  passed: boolean | null;
  rationale: string;
  retrievedPassages?: RetrievedPassage[];
};

export type EvalErrorCode = "precheck" | "postcheck" | "judge" | "config";

export type EvaluateSuccess = {
  ok: true;
  verdict: Verdict;
};

export type EvaluateFailure = {
  ok: false;
  error: string;
  code: EvalErrorCode;
};

export type EvaluateResult = EvaluateSuccess | EvaluateFailure;

export type JudgeCompleteInput = {
  system: string;
  user: string;
  model: string;
};

export type JudgeComplete = (input: JudgeCompleteInput) => Promise<string>;
