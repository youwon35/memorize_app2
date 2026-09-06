const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../App.js"), "utf8");
const ast = parser.parse(appSource, { sourceType: "module", plugins: ["jsx"] });
const handlers = new Map();
traverse(ast, { VariableDeclarator({ node }) {
  if (node.id.type === "Identifier" && node.init?.type === "ArrowFunctionExpression") {
    handlers.set(node.id.name, appSource.slice(node.init.start, node.init.end));
  }
}});
const handler = (name, context) => {
  assert.ok(handlers.has(name), "App handler exists: " + name);
  return new Function(...Object.keys(context), "return (" + handlers.get(name) + ")")(...Object.values(context));
};
let memory;
before(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/utils/memory.js"), "utf8");
  memory = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
});
const noop = () => {};
const resetSetters = Object.fromEntries([
  "setDeck", "setQuizIndex", "setAnswer", "setHintVisible", "setFeedback", "setResult",
  "setRoundComplete", "setRoundIncorrectIds",
].map((name) => [name, noop]));

test("completing a round then returning to setup preserves completed history", async () => {
  const pair = memory.createLocalPair("hello", "안녕", { folderId: "folder-a" });
  const deck = memory.buildPracticeDeck([pair], 1, "front", memory.createEmptyStudyStats());
  const beforeStats = memory.createEmptyStudyStats();
  const studyStatsRef = { current: memory.recordStudyAttempt(beforeStats, deck[0], false) };
  const roundSnapshotRef = { current: beforeStats };
  const roundMetaRef = { current: { folderId: "folder-a" } };
  const common = {
    ...resetSetters, studyStatsRef, roundSnapshotRef, roundMetaRef,
    updateStudyStats: (next) => { studyStatsRef.current = next; return Promise.resolve(); },
  };
  handler("finalizeRound", {
    ...common, deck, roundIncorrectIds: [deck[0].id], quizMode: "front", quizFolderId: "folder-a",
    appendStudySession: memory.appendStudySession, MAX_SESSION_HISTORY: 60,
  })();
  assert.equal(studyStatsRef.current.sessions.length, 1);
  assert.equal(studyStatsRef.current.sessions[0].incorrectCards[0].pairId, pair.id);
  assert.equal(studyStatsRef.current.sessions[0].incorrectCards[0].folderId, "folder-a");
  assert.equal(roundSnapshotRef.current, null);
  await handler("resetQuizSession", { ...common, timerRef: { current: null }, clearTimeout })();
  assert.equal(studyStatsRef.current.sessions.length, 1);
});

test("a submitted answer cannot be counted again by a repeated event", () => {
  for (const result of ["correct", "incorrect"]) {
    let attempts = 0;
    handler("submitAnswer", {
      current: { answer: "hello" }, result, answer: "hello",
      updateStudyStats: () => attempts++,
    })();
    assert.equal(attempts, 0);
  }
});

test("overlapping saves retain both cards and reject repeated duplicates", async () => {
  const pairsRef = { current: [] };
  const context = {
    pairsRef, saveFolderId: "root", normalizeFolderId: (id) => id ?? "root",
    createFolderScopedSignature: (left, right, folderId) => JSON.stringify([folderId, left.toLowerCase(), right.toLowerCase()]),
  };
  const saveEntryBatch = handler("saveEntryBatch", {
    ...context, prepareEntryBatch: handler("prepareEntryBatch", context),
    sessionRef: { current: null }, dataRevisionRef: { current: 0 },
    cardWriteQueueRef: { current: Promise.resolve() },
    createLocalPair: memory.createLocalPair, mergePairsBySignature: memory.mergePairsBySignature,
    supabase: null,
    savePairs: async (pairs) => {
      await new Promise((resolve) => setImmediate(resolve));
      pairsRef.current = pairs;
    },
  });
  const results = await Promise.all([
    saveEntryBatch([{ left: "hello", right: "안녕" }]),
    saveEntryBatch([{ left: "sun", right: "해" }]),
    saveEntryBatch([{ left: "hello", right: "안녕" }]),
  ]);
  assert.equal(pairsRef.current.length, 2);
  assert.equal(results[2].skippedDuplicates, 1);
});

test("startup restores hidden state after cards load; unreadable cards do not enable writes", async () => {
  const pair = memory.createLocalPair("hello", "안녕");
  const storedStats = memory.setPairHidden(memory.createEmptyStudyStats(), pair, true);
  for (const broken of [false, true]) {
    const ready = [];
    const alerts = [];
    const pairsRef = { current: [] }, studyStatsRef = { current: {} };
    const context = {
      active: true, pairsRef, studyStatsRef,
      AsyncStorage: {
        getItem: async (key) => key === "cards" ? (broken ? "{" : JSON.stringify([pair]))
          : key === "stats" ? JSON.stringify(storedStats) : null,
        setItem: async () => { throw Error("Startup must not rewrite current-format cards"); },
      },
      LANGUAGE_KEY: "language", THEME_MODE_KEY: "theme", DAILY_STUDY_GOAL_KEY: "goal",
      STUDY_STATS_KEY: "stats", TUTORIAL_SEEN_KEY: "tutorial", SUPPORT_REQUESTS_KEY: "support",
      STUDY_REMINDERS_ENABLED_KEY: "reminders", FOLDERS_STORAGE_KEY: "folders",
      STORAGE_KEY: "cards", LEGACY_STORAGE_KEYS: [],
      isSupportedLanguage: () => false, setThemeMode: noop,
      setStudyRemindersEnabled: noop, setTutorialSeen: noop, setTutorialReady: noop,
      normalizePairFolder: (value) => value, sortPairs: memory.sortPairs,
      createPersistableStudyStats: memory.createPersistableStudyStats,
      createEmptyStudyStats: memory.createEmptyStudyStats,
      setPairs: noop, setStudyStats: noop,
      setPreferencesReady: (value) => ready.push(value), setStorageReady: (value) => ready.push(value),
      t: (key) => key, Alert: { alert: (...args) => alerts.push(args) },
    };
    await handler("load", context)();
    if (broken) {
      assert.equal(ready.length, 0);
      assert.equal(alerts.length, 1);
      assert.equal(pairsRef.current.length, 0);
    } else {
      assert.deepEqual(ready, [true, true]);
      assert.equal(memory.isPairHidden(studyStatsRef.current, pair), true);
    }
  }
});

function mutationContext(onRequest = noop) {
  const pair = { id: "card-a", left: "front", right: "back", folderId: "folder-a", source: "cloud" };
  const folder = { id: "folder-a", parentId: "root", name: "Existing folder", source: "cloud" };
  const writes = [], requests = [];
  let confirm;
  const context = {
    session: { user: { id: "account-a" } },
    sessionRef: { current: { user: { id: "account-a" } } },
    dataRevisionRef: { current: 0 },
    pairs: [pair], pairsRef: { current: [pair] },
    folders: [folder], foldersRef: { current: [folder] },
    cloudFoldersReadyRef: { current: true },
    ROOT_FOLDER_ID: "root", language: "en",
    folderNameDraft: "New folder", folderRenameDraft: "Renamed folder",
    editingId: pair.id, editingLeft: "changed front", editingRight: "changed back",
    editingFolderId: "folder-a", selectedManagePairIds: [pair.id],
    normalizeFolderId: (id) => id ?? "root",
    createLocalFolder: (name, parentId) => ({ id: "folder-new", parentId, name, source: "local" }),
    updatePairValues: (target, left, right) => ({ ...target, left, right }),
    createFolderScopedSignature: (left, right, folderId) => JSON.stringify([folderId, left, right]),
    mapFolderRecord: (row) => row, mapPairRecord: (row) => row,
    getFolderSubtreeIds: (_, id) => new Set([id]),
    isCloudFolderSchemaError: () => false,
    studyStatsRef: { current: {} },
    migrateStudyStatsEntry: (stats) => stats, removeFolderStyles: (stats) => stats,
    savePairs: async (rows) => { writes.push("pairs"); context.pairsRef.current = rows; },
    saveFolders: async (rows) => { writes.push("folders"); context.foldersRef.current = rows; },
    updateStudyStats: async (stats) => { writes.push("stats"); context.studyStatsRef.current = stats; },
    t: (key) => key,
    Alert: { alert: (_, __, buttons) => { confirm = buttons?.find((button) => button.style === "destructive")?.onPress; } },
    ...Object.fromEntries([
      "setFolderNameDraft", "setCreatingFolderKey", "setFolderActionMenuKey", "cancelFolderRename",
      "setTranslatedNote", "setEditingId", "setEditingLeft", "setEditingRight", "setEditingFolderId",
      "setSelectedManagePairIds", "setManageSelectionMode", "setOpenManageSwipeId",
      "setSaveFolderId", "setQuizFolderId", "setManageFolderId",
    ].map((name) => [name, noop])),
    supabase: { from(table) {
      const request = { table };
      const query = {
        insert(row) { request.operation = "insert"; request.row = row; return query; },
        update(row) { request.operation = "update"; request.row = row; return query; },
        delete() { request.operation = "delete"; return query; },
        select() { return query; }, single() { return query; },
        eq(column, value) { request[column] = value; return query; },
        in(column, values) { request[column] = values; return query; },
        then(resolveResult, rejectResult) {
          return Promise.resolve().then(() => {
            requests.push(request);
            onRequest(context, request, requests.length);
            return { data: table === "memory_folders" ? { ...folder, ...request.row } : { ...pair, ...request.row }, error: null };
          }).then(resolveResult, rejectResult);
        },
      };
      return query;
    } },
  };
  return { context, pair, writes, requests, confirm: () => confirm?.() };
}
async function runMutation(name, fixture) {
  const args = name === "removePair" ? [fixture.pair]
    : name === "createFolderInCurrentLocation" ? ["root"]
    : ["saveFolderRename", "deleteFolder"].includes(name) ? ["folder-a"] : [];
  await handler(name, fixture.context)(...args);
  if (name === "deleteFolder") {
    fixture.confirm();
    await new Promise((resolve) => setImmediate(resolve));
  }
}
for (const name of [
  "createFolderInCurrentLocation", "saveFolderRename", "saveEdit",
  "removePair", "deleteSelectedManagePairs", "deleteFolder",
]) {
  test(name + " discards an old account response before changing local data", async () => {
    const fixture = mutationContext((context) => {
      context.sessionRef.current = { user: { id: "account-b" } };
      context.pairsRef.current = [];
      context.foldersRef.current = [];
    });
    await runMutation(name, fixture);
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.context.pairsRef.current, []);
    assert.deepEqual(fixture.context.foldersRef.current, []);
  });
}
test("deleting one card retains cards received while server deletion is pending", async () => {
  const newPair = { id: "card-new", left: "new", right: "new", folderId: "root", source: "cloud" };
  const fixture = mutationContext((context) => { context.pairsRef.current = [...context.pairsRef.current, newPair]; });
  await runMutation("removePair", fixture);
  assert.deepEqual(fixture.context.pairsRef.current, [newPair]);
});
test("deleting a folder retains unrelated cards and folders received during server requests", async () => {
  const newPair = { id: "card-new", left: "new", right: "new", folderId: "root", source: "cloud" };
  const newFolder = { id: "folder-new", name: "New", parentId: "root", source: "cloud" };
  const fixture = mutationContext((context, _, count) => {
    if (count === 1) {
      context.pairsRef.current = [...context.pairsRef.current, newPair];
      context.foldersRef.current = [...context.foldersRef.current, newFolder];
    }
  });
  await runMutation("deleteFolder", fixture);
  assert.ok(fixture.context.pairsRef.current.some((pair) => pair.id === newPair.id));
  assert.equal(fixture.context.pairsRef.current.find((pair) => pair.id === fixture.pair.id).folderId, "root");
  assert.deepEqual(fixture.context.foldersRef.current, [newFolder]);
});
test("an old folder deletion confirmation cannot start requests under another account", async () => {
  const fixture = mutationContext();
  await handler("deleteFolder", fixture.context)("folder-a");
  fixture.context.sessionRef.current = { user: { id: "account-b" } };
  fixture.confirm();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.writes, []);
});
test("queued cards keep the submitting account and stop after account changes", async () => {
  let release;
  const queued = new Promise((resolve) => { release = resolve; });
  const sessionRef = { current: { user: { id: "account-a" } } };
  const saveEntryBatch = handler("saveEntryBatch", {
    sessionRef, cardWriteQueueRef: { current: queued },
  });
  const pending = saveEntryBatch([{ left: "private", right: "card" }]);
  sessionRef.current = { user: { id: "account-b" } };
  release();
  await assert.rejects(pending, /Account changed before saving cards/);
});

traverse(ast, { FunctionDeclaration({ node }) {
  if (["persistCloudUserState", "scheduleCloudUserStateSync"].includes(node.id?.name)) {
    handlers.set(node.id.name, appSource.slice(node.start, node.end));
  }
}});
function cloudWriteFixture(respond = async () => ({ error: null })) {
  const calls = [];
  const context = {
    storageReady: true, launchVisible: false,
    cloudStateWriteQueueRef: { current: Promise.resolve() },
    cloudSyncReadyRef: { current: true }, cloudUserStateReadyRef: { current: true },
    sessionRef: { current: { user: { id: "account-a" } } },
    studyStatsRef: { current: {} }, dailyStudyGoalRef: { current: 5 }, pairsRef: { current: [] },
    createPersistableStudyStats: (stats) => stats, normalizeDailyStudyGoal: (goal) => goal,
    isCloudUserStateSchemaError: (error) => error.code === "schema_missing",
    supabase: { from: () => ({ upsert: (payload) => { calls.push(payload); return respond(payload, calls.length); } }) },
  };
  return { context, calls, persist: handler("persistCloudUserState", context) };
}
test("cloud state writes finish in submission order when the first is slow", async () => {
  let finishFirst;
  const response = new Promise((resolve) => { finishFirst = resolve; });
  const fixture = cloudWriteFixture((_, count) => count === 1 ? response : Promise.resolve({ error: null }));
  const first = fixture.persist({ attempts: 1 }, 5), second = fixture.persist({ attempts: 2 }, 6);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.calls.length, 1);
  finishFirst({ error: null });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(fixture.calls.map((call) => call.study_stats.attempts), [1, 2]);
  assert.equal(fixture.calls[1].daily_study_goal, 6);
});
test("a failed cloud write does not block the next state", async () => {
  const fixture = cloudWriteFixture(async (_, count) => count === 1 ? { error: new Error("offline") } : { error: null });
  const first = fixture.persist({ attempts: 1 }), second = fixture.persist({ attempts: 2 });
  await assert.rejects(first, /offline/);
  assert.equal(await second, true);
  assert.equal(fixture.calls.length, 2);
});
test("queued writes and late schema errors cannot affect a new account", async () => {
  let finishFirst;
  const response = new Promise((resolve) => { finishFirst = resolve; });
  const fixture = cloudWriteFixture(() => response);
  const first = fixture.persist({ attempts: 1 }), second = fixture.persist({ attempts: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  fixture.context.sessionRef.current = { user: { id: "account-b" } };
  finishFirst({ error: { code: "schema_missing" } });
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.context.cloudUserStateReadyRef.current, true);
});
test("queued cloud writes stop when readiness is revoked", async () => {
  let finishFirst;
  const response = new Promise((resolve) => { finishFirst = resolve; });
  const fixture = cloudWriteFixture(() => response);
  const first = fixture.persist({ attempts: 1 }), second = fixture.persist({ attempts: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  fixture.context.cloudSyncReadyRef.current = false;
  finishFirst({ error: null });
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.context.cloudSyncReadyRef.current, false);
});
test("manual pull drains submitted writes before reading rows", async () => {
  let finishFirst;
  const response = new Promise((resolve) => { finishFirst = resolve; });
  const fixture = cloudWriteFixture((_, count) => count === 1 ? response : Promise.resolve({ error: null }));
  const first = fixture.persist({ attempts: 1 }), second = fixture.persist({ attempts: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  let reads = 0, observed;
  const pull = handler("sync", {
    ...fixture.context, userId: "account-a", foldersRef: { current: [] },
    cloudUserStateSyncTimerRef: { current: null },
    setSyncing: noop, setTranslatedNote: noop, clearTimeout: noop,
    isActive: () => true, isCurrentAccount: () => true,
    assertSyncActive: (active) => assert.equal(active(), true),
    isCloudFolderSchemaError: () => false,
    fetchAllUserRows: async () => {
      reads += 1;
      observed = { writes: fixture.calls.length, ready: fixture.context.cloudSyncReadyRef.current };
      throw new Error("End the test at the read boundary");
    },
  })();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 0);
  assert.equal(fixture.context.cloudSyncReadyRef.current, true);
  finishFirst({ error: null });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  await pull;
  assert.equal(reads, 1);
  assert.deepEqual(observed, { writes: 2, ready: false });
});
test("a delayed cloud timer cannot submit a previous account's state", () => {
  const fixture = cloudWriteFixture();
  let callback, writes = 0;
  handler("scheduleCloudUserStateSync", {
    ...fixture.context, cloudUserStateSyncTimerRef: { current: null },
    clearTimeout: noop, setTimeout: (fn) => { callback = fn; return 1; },
    persistCloudUserState: async () => { writes += 1; }, setTranslatedNote: noop,
  })({ attempts: 1 }, 5);
  fixture.context.sessionRef.current = { user: { id: "account-b" } };
  callback();
  assert.equal(writes, 0);
});
