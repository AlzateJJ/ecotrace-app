import { openDB } from "idb";
import type { Data, DeliveryDraft } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function connectionUnavailable(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError && [502, 503, 504].includes(error.status))
  );
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "x-ecotrace-request": "1" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response
    .json()
    .catch(() => ({ message: "Respuesta inesperada del servidor." }));
  if (!response.ok)
    throw new ApiError(response.status, result.message || "Ocurrió un error.");
  return result;
}
const db = openDB("ecotrace-offline", 1, {
  upgrade(db) {
    db.createObjectStore("cache");
    db.createObjectStore("deliveries", { keyPath: "clientId" });
  },
});
export async function cacheData(data: Data) {
  await (await db).put("cache", data, data.user.id);
  localStorage.setItem("ecotrace-user", data.user.id);
}
export async function cachedData(): Promise<Data | undefined> {
  const uid = localStorage.getItem("ecotrace-user");
  return uid ? (await db).get("cache", uid) : undefined;
}
export async function clearCachedUser() {
  const uid = localStorage.getItem("ecotrace-user");
  if (uid) await (await db).delete("cache", uid);
  localStorage.removeItem("ecotrace-user");
}
export async function queueDelivery(userId: string, draft: DeliveryDraft) {
  await (
    await db
  ).put("deliveries", { ...draft, userId, queuedAt: new Date().toISOString() });
}
export async function pendingDeliveries(
  userId: string,
): Promise<(DeliveryDraft & { userId: string; queuedAt: string })[]> {
  return (await (await db).getAll("deliveries")).filter(
    (x) => x.userId === userId,
  );
}
export async function syncDeliveries(userId: string) {
  let count = 0;
  for (const draft of await pendingDeliveries(userId)) {
    const { userId: _, queuedAt: __, ...body } = draft;
    await api("/lots", "POST", body);
    await (await db).delete("deliveries", draft.clientId);
    count++;
  }
  return count;
}
