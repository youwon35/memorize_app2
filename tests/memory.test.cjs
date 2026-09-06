const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const memory = import("data:text/javascript;base64," + fs.readFileSync(path.join(__dirname, "../src/utils/memory.js")).toString("base64"));
const pair = (id, folderId = "root", left = "apple", right = "사과") => ({
  id, folderId, left, right, source: "local", createdAt: "2026-01-01T00:00:00.000Z",
});
const question = (m, value) => m.buildPracticeDeck([value], 1, "front")[0];
const legacyStats = (m, a) => ({
  ...m.createEmptyStudyStats(),
  cards: { [m.createSignature(a.left, a.right)]: { left: a.left, right: a.right, attempts: 4, correct: 3, incorrect: 1, lastStudiedAt: "2026-01-02T00:00:00.000Z" } },
  hiddenCards: { [m.createSignature(a.left, a.right)]: { hidden: true, updatedAt: "2026-01-02T00:00:00.000Z" } },
});

test("identical cards in different folders have independent attempts and hidden state", async () => {
  const m = await memory, a = pair("a", "folder-a"), b = pair("b", "folder-b");
  let stats = m.syncStudyStatsWithPairs(m.createEmptyStudyStats(), [a, b]);
  stats = m.recordStudyAttempt(stats, question(m, a), false);
  stats = m.setPairHidden(stats, a, true);
  assert.equal(m.getPairStudySummary(stats, a).attempts, 1);
  assert.equal(m.getPairStudySummary(stats, b).attempts, 0);
  assert.equal(m.isPairHidden(stats, a), true);
  assert.equal(m.isPairHidden(stats, b), false);
  const deck = m.buildPracticeDeck([a, b], 10, "both", stats);
  assert.equal(deck.length, 2);
  assert.ok(deck.every(card => card.pairId === b.id && card.folderId === b.folderId));
});
test("legacy history migrates once and later copies start independently", async () => {
  const m = await memory, a = pair("a", "folder-a"), b = pair("b", "folder-b");
  const legacyKey = m.createSignature(a.left, a.right);
  let stats = m.createPersistableStudyStats(legacyStats(m, a), [a, b]);
  assert.equal(m.getPairStudySummary(stats, a).attempts, 4);
  assert.equal(m.getPairStudySummary(stats, b).attempts, 4);
  assert.equal(stats.cards[legacyKey], undefined);
  assert.equal(stats.hiddenCards[legacyKey], undefined);
  assert.equal(m.isPairHidden(stats, a), true);
  assert.equal(m.isPairHidden(stats, b), true);
  assert.deepEqual(m.createPersistableStudyStats(stats, [a, b]), stats);
  stats = m.setPairHidden(stats, a, false);
  stats = m.recordStudyAttempt(stats, question(m, a), true);
  const c = pair("c", "folder-c");
  stats = m.createPersistableStudyStats(stats, [a, b, c]);
  assert.equal(m.getPairStudySummary(stats, a).attempts, 5);
  assert.equal(m.getPairStudySummary(stats, b).attempts, 4);
  assert.equal(m.getPairStudySummary(stats, c).attempts, 0);
  assert.equal(m.isPairHidden(stats, a), false);
  assert.equal(m.isPairHidden(stats, b), true);
  assert.equal(m.isPairHidden(stats, c), false);
});
test("editing and moving retain history without pruning other hidden cards", async () => {
  const m = await memory, a = pair("a", "folder-a"), b = pair("b", "folder-b", "pear", "배");
  let stats = m.syncStudyStatsWithPairs(m.createEmptyStudyStats(), [a, b]);
  stats = m.recordStudyAttempt(stats, question(m, a), false);
  stats = m.setPairHidden(m.setPairHidden(stats, a, true), b, true);
  const sameKeyEdit = { ...a, left: "APPLE" };
  stats = m.migrateStudyStatsEntry(stats, a, sameKeyEdit);
  assert.equal(m.isPairHidden(stats, b), true);
  const moved = { ...a, left: "apples", folderId: "folder-c" };
  stats = m.migrateStudyStatsEntry(stats, sameKeyEdit, moved);
  assert.equal(m.getPairStudySummary(stats, moved).attempts, 1);
  assert.equal(m.getPairStudySummary(stats, moved).incorrect, 1);
  assert.equal(m.isPairHidden(stats, moved), true);
  assert.equal(m.isPairHidden(stats, b), true);
  assert.equal(stats.cards[m.createStudySignature(a)], undefined);
  const persisted = m.createPersistableStudyStats(stats, [moved, b]);
  assert.equal(m.isPairHidden(persisted, moved), true);
  assert.equal(m.isPairHidden(persisted, b), true);
});
test("cloud ID replacement preserves history and retry lookup", async () => {
  const m = await memory, local = pair("local-123", "folder-a");
  const cloud = { ...local, id: "cloud-uuid", source: "cloud" };
  const stats = m.recordStudyAttempt(m.createEmptyStudyStats(), question(m, local), true);
  const merged = m.mergeStudyStats(stats, m.createEmptyStudyStats(), [cloud]);
  assert.equal(m.createStudySignature(local), m.createStudySignature(cloud));
  assert.equal(m.getPairStudySummary(merged, cloud).attempts, 1);
  assert.equal(m.resolveStudyPair(question(m, local), [cloud]), cloud);
});
test("cloud merges are idempotent and retain aggregate-only history", async () => {
  const m = await memory, a = pair("a", "folder-a"), remote = legacyStats(m, a);
  let local = m.createPersistableStudyStats(remote, [a]);
  local = m.recordStudyAttempt(local, question(m, a), true);
  local = m.setPairHidden(local, a, false);
  const first = m.mergeStudyStats(local, remote, [a]);
  assert.equal(m.getPairStudySummary(first, a).attempts, 5);
  assert.equal(m.getPairStudySummary(first, a).correct, 4);
  assert.equal(m.isPairHidden(first, a), false);
  assert.deepEqual(m.mergeStudyStats(first, remote, [a]), first);
});
test("retry lookup rejects ambiguous or deleted cards", async () => {
  const m = await memory, a = pair("a", "folder-a"), b = pair("b", "folder-b");
  const legacy = { signature: m.createSignature(a.left, a.right), left: a.left, right: a.right };
  assert.equal(m.resolveStudyPair(legacy, [a, b]), null);
  assert.equal(m.resolveStudyPair(legacy, [a]), a);
  assert.equal(m.resolveStudyPair({ ...legacy, folderId: b.folderId }, [a, b]), b);
  assert.equal(m.resolveStudyPair(question(m, a), [b]), null);
  assert.equal(m.resolveStudyPair(question(m, a), []), null);
  const edited = { ...a, left: "edited", folderId: "new-folder" };
  assert.equal(m.resolveStudyPair(question(m, a), [edited]), edited);
});
test("session serialization retains identities and old sessions remain readable", async () => {
  const m = await memory, a = pair("a", "folder-a");
  const oldCard = { signature: m.createSignature(a.left, a.right), left: a.left, right: a.right, direction: "A_TO_B" };
  const stats = m.appendStudySession(m.createEmptyStudyStats(), {
    id: "session-1", completedAt: "2026-01-03T00:00:00.000Z", startedAt: "2026-01-03T00:00:00.000Z",
    folderId: a.folderId, totalCards: 2, correctCount: 0, incorrectCount: 2,
    incorrectCards: [question(m, a), oldCard],
  });
  const persisted = m.createPersistableStudyStats(stats, [a]);
  const [newCard, preservedOld] = persisted.sessions[0].incorrectCards;
  assert.equal(newCard.pairId, a.id);
  assert.equal(newCard.folderId, a.folderId);
  assert.equal(newCard.signature, m.createStudySignature(a));
  assert.equal(persisted.sessions[0].folderId, a.folderId);
  assert.equal(preservedOld.signature, oldCard.signature);
  assert.equal(preservedOld.folderId, undefined);
});
test("technical and numeric answers preserve meaning", async () => {
  const m = await memory;
  for (const [input, expected] of [
    ["C", "C++"], ["C", "C#"], ["1234", "1235"], ["-5", "5"], ["1.5", "15"],
    ["2025년", "2026년"], ["x+y", "xy"], ["x=1", "x=2"], ["nodejs", "node.js"], ["a/b", "ab"], ["x≤y", "x≥y"],
  ]) assert.equal(m.compareAnswers(input, expected), false, input + " versus " + expected);
  assert.equal(m.compareAnswers(" C++ ", "c++"), true);
  assert.equal(m.compareAnswers("1 + 2", "1+2"), true);
  assert.equal(m.compareAnswers("１２３４", "1234"), true);
});
test("natural-language punctuation, particles and minor typos stay lenient", async () => {
  const m = await memory;
  for (const [input, expected] of [
    ["HELLO, world!", "hello world"], ["대한민국은", "대한민국"], ["memory", "memori"], ["New York", "newyork"], ["사과를", "사과"],
  ]) assert.equal(m.compareAnswers(input, expected), true, input + " versus " + expected);
  assert.equal(m.compareAnswers("cat", "car"), false);
  assert.equal(m.compareAnswers("", ""), false);
});

test("legacy text beginning with v2 is not mistaken for a scoped key", async () => {
  const m = await memory;
  const a = pair("legacy-v2", "root", "v2: protocol", "second version");
  const old = { left: a.left, right: a.right, signature: m.createSignature(a.left, a.right) };
  assert.equal(m.resolveStudyPair(old, [a]), a);
});
