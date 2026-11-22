import { apiError } from "@/lib/api-error";
import { getAuth } from "@/lib/auth";

export async function DELETE(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  const url = new URL("/api/auth/delete-user", request.url);
  const response = await (await getAuth()).handler(new Request(url, {
    method: "POST",
    headers,
    body: "{}",
  }));
  if (response.ok) {
    const resultHeaders = new Headers();
    for (const cookie of response.headers.getSetCookie()) resultHeaders.append("Set-Cookie", cookie);
    return new Response(null, { status: 204, headers: resultHeaders });
  }
  if (response.status === 401) return apiError("unauthenticated", "Sign in to continue.");
  if (response.status === 400) return apiError("validation_failed", "Sign out and sign in again before deleting your account.");
  return response;
}
