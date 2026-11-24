export async function securityRequest(
  action: string,
  values: Record<string, unknown> = {},
) {
  const response = await fetch("/api/security", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, ...values }),
  });
  const result = await response.json().catch(() => ({
    error: "The protected server is unavailable. Please try again.",
  }));
  if (!response.ok)
    throw Error(result.error || "Could not complete the request.");
  return result;
}

export async function lockWebsite(adminOnly = false) {
  await securityRequest(adminOnly ? "admin-logout" : "logout");
  location.assign(adminOnly ? "/admin" : "/");
}
