import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getDb } from "./db";

async function configureAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return betterAuth({
    database: mongodbAdapter(await getDb()),
    emailAndPassword: { enabled: true },
    socialProviders: clientId && clientSecret ? { google: { clientId, clientSecret } } : {},
    account: { accountLinking: { enabled: false } },
  });
}

let instance: ReturnType<typeof configureAuth> | undefined;
export function getAuth() {
  return instance ??= configureAuth().catch(error => { instance = undefined; throw error; });
}
export async function getCurrentUserId(headers: Headers) {
  const session = await (await getAuth()).api.getSession({ headers });
  return session?.user.id;
}
