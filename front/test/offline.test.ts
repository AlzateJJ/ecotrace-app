import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  connectionUnavailable,
  pendingDeliveries,
  queueDelivery,
  syncDeliveries,
} from "../src/api.ts";

test("offline deliveries survive failed requests and replay only their owner's drafts", async (t) => {
  const a = {
    clientId: "draft-a",
    materialId: "pet-clear",
    centerId: "center-a",
    declaredKg: 25,
  };
  const b = { ...a, clientId: "draft-b", declaredKg: 70 };
  await queueDelivery("user-a", a);
  await queueDelivery("user-a", a);
  await queueDelivery("user-b", b);
  assert.equal((await pendingDeliveries("user-a")).length, 1);
  const bodies: any[] = [];
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      bodies.push(JSON.parse(String(options.body)));
      throw new TypeError("Network unavailable");
    },
  );
  await assert.rejects(syncDeliveries("user-a"));
  assert.equal((await pendingDeliveries("user-a")).length, 1);
  fetchMock.mock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ message: "Session expired" }), {
        status: 401,
      }),
  );
  await assert.rejects(
    syncDeliveries("user-a"),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  assert.equal((await pendingDeliveries("user-a")).length, 1);
  fetchMock.mock.mockImplementation(
    async (_url: unknown, options: RequestInit) => {
      bodies.push(JSON.parse(String(options.body)));
      assert.equal(
        (options.headers as Record<string, string>)["x-ecotrace-request"],
        "1",
      );
      return new Response(JSON.stringify({ id: "lot-a" }));
    },
  );
  assert.equal(await syncDeliveries("user-a"), 1);
  assert.deepEqual(bodies, [a, a]); // A retry keeps the same server idempotency key.
  assert.equal((await pendingDeliveries("user-a")).length, 0);
  assert.equal((await pendingDeliveries("user-b")).length, 1);
  assert.equal(await syncDeliveries("user-a"), 0);
});

test("network failures can use cached data but permission failures cannot", () => {
  assert.equal(connectionUnavailable(new TypeError("Failed to fetch")), true);
  assert.equal(
    connectionUnavailable(new ApiError(502, "Gateway unavailable")),
    true,
  );
  for (const status of [400, 401, 403, 404, 409, 429]) {
    assert.equal(
      connectionUnavailable(new ApiError(status, "Rejected")),
      false,
    );
  }
});
