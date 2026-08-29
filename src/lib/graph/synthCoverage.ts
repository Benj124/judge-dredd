type Coverable = { question: string; expected_facts?: string[] };

export type SourceSection = {
  heading: string;
  text: string;
};

export type CoverageReport = {
  sections: Array<{ heading: string; hit: boolean }>;
  hitCount: number;
  missedCount: number;
  missedHeadings: string[];
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "are",
  "was",
  "were",
  "have",
  "has",
  "not",
  "but",
  "you",
  "your",
  "into",
  "about",
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP.has(token));
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  return inter / (a.size + b.size - inter);
}

/**
 * Split source prose into sections: heading-like lines, else paragraphs.
 */
export function splitSourceSections(fullText: string): SourceSection[] {
  const text = fullText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const headingSplit = text.split(/\n(?=[^\n]{1,80}\n)/);
  const fromHeadings: SourceSection[] = [];
  if (headingSplit.length >= 2) {
    for (const block of headingSplit) {
      const trimmed = block.trim();
      if (trimmed.length < 40) continue;
      const nl = trimmed.indexOf("\n");
      const first = (nl >= 0 ? trimmed.slice(0, nl) : trimmed).trim();
      const rest = (nl >= 0 ? trimmed.slice(nl + 1) : "").trim();
      const headingLike = first.length <= 80 && !/[.!?]$/.test(first);
      fromHeadings.push({
        heading: headingLike ? first : `Section ${fromHeadings.length + 1}`,
        text: headingLike && rest ? rest : trimmed,
      });
    }
  }
  if (fromHeadings.length >= 2) return fromHeadings;

  const paras = text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter((para) => para.length >= 40);
  if (paras.length >= 2) {
    return paras.map((para, index) => ({
      heading: `Section ${index + 1}`,
      text: para,
    }));
  }
  return [{ heading: "Full document", text }];
}

export function coverageVsSource(
  fullText: string,
  questions: Coverable[],
): CoverageReport {
  const sections = splitSourceSections(fullText);
  const queryTokens = tokenize(
    questions
      .map((item) => `${item.question} ${(item.expected_facts ?? []).join(" ")}`)
      .join(" "),
  );
  const mapped = sections.map((section) => {
    const score = jaccard(tokenize(section.text), queryTokens);
    const hit = score >= 0.08 || [...tokenize(section.text)].some((token) => {
      if (token.length < 5) return false;
      return questions.some(
        (item) =>
          item.question.toLowerCase().includes(token) ||
          (item.expected_facts ?? []).some((fact) =>
            fact.toLowerCase().includes(token),
          ),
      );
    });
    return { heading: section.heading, hit };
  });
  const hitCount = mapped.filter((row) => row.hit).length;
  const missedHeadings = mapped.filter((row) => !row.hit).map((row) => row.heading);
  return {
    sections: mapped,
    hitCount,
    missedCount: missedHeadings.length,
    missedHeadings,
  };
}

export function coverageVsDocuments(
  docs: Array<{ fullText: string }>,
  questions: Coverable[],
): CoverageReport {
  const combined = docs.map((doc) => doc.fullText).join("\n\n");
  return coverageVsSource(combined, questions);
}
