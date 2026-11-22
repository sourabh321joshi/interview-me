import { z } from "zod";

const s = (max: number) => z.string().trim().max(max);

// Shape from database-design-v0.2.md, 6.1. Unknown keys from the model are dropped.
export const ProfileSummarySchema = z.object({
  schema_version: z.literal(1).default(1),
  first_name: s(50),
  years_experience: z.number().min(0).max(40),
  education: z.array(z.object({ degree: s(100), year: z.number().int().min(1950).max(2100).nullable() })).max(5),
  skills: z.array(s(50)).max(30),
  projects: z.array(z.object({ name: s(100), description: s(300), tech: z.array(s(40)).max(12), role: s(200) })).max(8),
  experience: z.array(z.object({ company: s(100), title: s(100), months: z.number().int().min(0).max(600), notes: s(300) })).max(8),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfilePatchSchema = ProfileSummarySchema.omit({ schema_version: true }).partial().strict()
  .refine((p) => Object.keys(p).length > 0, "Provide at least one field");

export const LlmGithubSchema = z.object({
  repos: z.array(z.object({ name: s(100), readme_gist: s(400), notable: z.array(s(150)).max(3) })).max(5),
});

export type GithubSummary = {
  schema_version: 1;
  fetched_at: string;
  repos: { name: string; readme_gist: string; languages: string[]; notable: string[]; last_pushed: string }[];
};

export const GithubUsernameSchema = z.string().regex(/^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/);
export const JobDescriptionSchema = z.string().trim().max(5000);
