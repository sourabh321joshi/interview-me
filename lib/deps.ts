import type { InterviewDeps } from "./interview-service";
import { createMongoInterviewsStore, createMongoUsersStore } from "./interviews-store";
import { getLlm, getModel } from "./llm";
import { createMongoProfilesStore } from "./profiles-store";
import type { ReportDeps } from "./report-service";
import { createMongoReportsStore } from "./reports-store";

export function interviewDeps(): InterviewDeps {
  return {
    interviews: createMongoInterviewsStore(), users: createMongoUsersStore(), profiles: createMongoProfilesStore(), llm: getLlm(),
    models: () => ({ plan: getModel("plan"), turn: getModel("turn"), report: getModel("report") }),
    freeLimit: Number.parseInt(process.env.FREE_INTERVIEW_LIMIT ?? "1", 10),
  };
}

export function reportDeps(): ReportDeps {
  return { interviews: createMongoInterviewsStore(), reports: createMongoReportsStore(), llm: getLlm(), model: () => getModel("report") };
}
