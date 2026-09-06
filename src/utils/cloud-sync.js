/** Reject sync after the account or local data changes. */
export const assertSyncActive = (isActive) => {
  if (!isActive()) {
    const error = new Error("Account sync was cancelled.");
    error.name = "AbortError";
    throw error;
  }
};

/** Complete every page before treating absent records as cloud deletions. */
export const fetchAllUserRows = async (
  client, table, userId, { isActive = () => true, pageSize = 500 } = {}
) => {
  if (!userId || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("A user ID and a page size between 1 and 1000 are required.");
  }
  const rows = [];
  const seenIds = new Set();
  let cursor;
  while (true) {
    assertSyncActive(isActive);
    let query = client.from(table).select("*")
      .eq("user_id", userId).order("id", { ascending: true }).limit(pageSize);
    if (cursor !== undefined) query = query.gt("id", cursor);
    const response = await query;
    assertSyncActive(isActive);
    if (response.error) throw response.error;
    if (!Array.isArray(response.data)) throw new Error("Cloud sync returned an invalid page.");
    // Server caps can be smaller than pageSize, so continue until an empty page.
    if (response.data.length === 0) return rows;
    for (const row of response.data) {
      if (typeof row?.id !== "string" || !row.id || seenIds.has(row.id)) {
        throw new Error("Cloud sync returned an invalid or repeated row ID.");
      }
      seenIds.add(row.id);
      rows.push(row);
    }
    cursor = response.data[response.data.length - 1].id;
  }
};
