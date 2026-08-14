import { stubComplete } from "./complete";
import { loadQuestions } from "./questions";
import { formatQuestionReport, runQuestions } from "./runQuestions";

async function main() {
  const questions = loadQuestions();
  const runs = await runQuestions(questions, stubComplete);
  process.stdout.write(`${formatQuestionReport(runs)}\n`);
  const failed = runs.filter((run) => !run.result.ok);
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} question(s) failed evaluate\n`);
    process.exitCode = 1;
  }
}

void main();
