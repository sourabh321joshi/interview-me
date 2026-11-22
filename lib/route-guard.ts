import { enforceRateLimit, type LimitName } from "./rate-limit";
import { handleError } from "./route-errors";

// Returns an error response when the user is over a limit, otherwise null.
export async function rateLimited(userId: string, ...names: LimitName[]): Promise<Response | null> {
  try {
    for (const n of names) await enforceRateLimit(userId, n);
    return null;
  } catch (err) {
    return handleError(err);
  }
}
