// Fixed development user until real authentication is added in M1.
// Always read the user id through this function, never from a request.
export const DEV_USER_ID = "dev-user-1";

export function getCurrentUserId(): string {
  return DEV_USER_ID;
}
