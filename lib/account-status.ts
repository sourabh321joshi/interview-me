import { consentPolicy } from "./consent";
import { COLLECTIONS, getDb } from "./db";
import { freeInterviewLimit, interviewAllowance } from "./quota";

type AccountRecord = {
  _id: string;
  display_name?: string | null;
  free_interviews_used?: number;
  paid_interview_credits?: number;
};

export async function getAccountStatus(user: { id: string; name: string }) {
  const { version, processors } = consentPolicy();
  const accounts = (await getDb()).collection<AccountRecord & {
    consents?: { version: string; processors: string[] }[];
  }>(COLLECTIONS.app_users);
  const record = await accounts.findOne({ _id: user.id });
  const accepted = record?.consents?.some(consent =>
    consent.version === version && consent.processors?.length === processors.length &&
    processors.every((processor, index) => consent.processors[index] === processor)
  );
  return {
    id: user.id,
    display_name: record?.display_name ?? user.name,
    ...interviewAllowance(freeInterviewLimit(), record),
    consent: { required_version: version, accepted_version: accepted ? version : null },
  };
}
