const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const helper = import("data:text/javascript;base64," + readFileSync(resolve(__dirname, "../src/utils/cloud-sync.js")).toString("base64"));
function fakeClient(rows, { serverLimit = Infinity, onRequest } = {}) {
  const calls = [];
  return { calls, from(table) {
    const request = { table };
    const query = {
      select(columns) { request.columns = columns; return query; },
      eq(column, value) { request.filter = [column, value]; return query; },
      order(column, options) { request.order = [column, options]; return query; },
      limit(value) { request.limit = value; return query; },
      gt(column, value) { request.cursor = [column, value]; return query; },
      then(resolveResult, rejectResult) {
        calls.push(request);
        return Promise.resolve().then(() => {
          const override = onRequest?.(request, calls.length);
          if (override) return override;
          return { data: rows.filter(row => row.user_id === request.filter[1]).filter(row => !request.cursor || row.id > request.cursor[1]).sort((left,right) => left.id.localeCompare(right.id)).slice(0, Math.min(request.limit, serverLimit)), error: null };
        }).then(resolveResult, rejectResult);
      },
    };
    return query;
  }};
}
const makeRows = (count, userId = "account-a") => Array.from({ length: count }, (_, index) => ({ id: String(index).padStart(5, "0"), user_id: userId, updated_at: String(count-index) }));
test("loads more than 1000 rows despite a smaller server cap", async () => {
  const { fetchAllUserRows } = await helper;
  const rows = makeRows(1203);
  const client = fakeClient([...rows].reverse(), { serverLimit: 200 });
  assert.deepEqual(await fetchAllUserRows(client, "memory_pairs", "account-a"), rows);
  assert.equal(client.calls.length, 8);
  assert.deepEqual(client.calls[0].order, ["id", { ascending: true }]);
  assert.deepEqual(client.calls[1].cursor, ["id", "00199"]);
});
test("scopes every page to the active account", async () => {
  const { fetchAllUserRows } = await helper;
  const expected = makeRows(3);
  const client = fakeClient([...expected, ...makeRows(3, "account-b")]);
  assert.deepEqual(await fetchAllUserRows(client, "memory_folders", "account-a", { pageSize: 2 }), expected);
  assert.ok(client.calls.every(call => call.filter[0] === "user_id" && call.filter[1] === "account-a"));
});
test("returns empty only after a successful empty page", async () => {
  const { fetchAllUserRows } = await helper;
  assert.deepEqual(await fetchAllUserRows(fakeClient([]), "memory_pairs", "account-a"), []);
});
test("rejects failed later pages without returning partial data", async () => {
  const { fetchAllUserRows } = await helper;
  const failure = { code: "network_error", message: "offline" };
  const client = fakeClient(makeRows(5), { onRequest: (_, count) => count === 2 ? { error: failure, data: null } : null });
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", "account-a", { pageSize: 2 }), error => error === failure);
  assert.equal(client.calls.length, 2);
});
test("does not request rows after cancellation", async () => {
  const { fetchAllUserRows } = await helper;
  const client = fakeClient(makeRows(5));
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", "account-a", { isActive: () => false }), { name: "AbortError" });
  assert.equal(client.calls.length, 0);
});
test("discards in-flight responses after cancellation", async () => {
  const { fetchAllUserRows } = await helper;
  let active = true;
  const client = fakeClient(makeRows(5), { onRequest: () => { active = false; } });
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", "account-a", { pageSize: 2, isActive: () => active }), { name: "AbortError" });
  assert.equal(client.calls.length, 1);
});
test("rejects malformed data instead of treating it as empty", async () => {
  const { fetchAllUserRows } = await helper;
  await assert.rejects(fetchAllUserRows(fakeClient([], { onRequest: () => ({ data: null, error: null }) }), "memory_pairs", "account-a"), /invalid page/);
});
test("rejects repeated IDs instead of looping", async () => {
  const { fetchAllUserRows } = await helper;
  const client = fakeClient([], { onRequest: () => ({ data: makeRows(1), error: null }) });
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", "account-a"), /repeated row ID/);
  assert.equal(client.calls.length, 2);
});
test("validates account and pagination before requesting", async () => {
  const { fetchAllUserRows } = await helper;
  const client = fakeClient([]);
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", ""), /user ID/);
  await assert.rejects(fetchAllUserRows(client, "memory_pairs", "account-a", { pageSize: 0 }), /page size/);
  assert.equal(client.calls.length, 0);
});
