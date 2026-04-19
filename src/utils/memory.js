const normalizeText = (value = "") =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const createId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createBlankDraft = () => ({
  id: createId("draft"),
  left: "",
  right: "",
});

export const createLocalPair = (left, right) => {
  const now = new Date().toISOString();

  return {
    id: createId("local"),
    left: left.trim(),
    right: right.trim(),
    source: "local",
    createdAt: now,
    updatedAt: now,
  };
};

export const updatePairValues = (pair, left, right) => ({
  ...pair,
  left: left.trim(),
  right: right.trim(),
  updatedAt: new Date().toISOString(),
});

export const createSignature = (left, right) =>
  `${normalizeText(left)}::${normalizeText(right)}`;

export const compareAnswers = (input, expected) =>
  normalizeText(input) === normalizeText(expected);

export const sortPairs = (pairs) =>
  [...pairs].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0)
  );

export const mergePairsBySignature = (...collections) => {
  const merged = new Map();

  collections.flat().forEach((pair) => {
    const signature = createSignature(pair.left, pair.right);
    const current = merged.get(signature);

    if (!current || pair.source === "cloud") {
      merged.set(signature, pair);
    }
  });

  return sortPairs(Array.from(merged.values()));
};

export const buildPracticeDeck = (pairs) =>
  shuffle(
    sortPairs(pairs).flatMap((pair) => [
      {
        id: `${pair.id}-front`,
        pairId: pair.id,
        prompt: pair.left,
        answer: pair.right,
        direction: "A_TO_B",
      },
      {
        id: `${pair.id}-back`,
        pairId: pair.id,
        prompt: pair.right,
        answer: pair.left,
        direction: "B_TO_A",
      },
    ])
  );

export const mapPairRecord = (record) => ({
  id: record.id,
  left: record.prompt_a ?? "",
  right: record.prompt_b ?? "",
  source: "cloud",
  userId: record.user_id ?? null,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const getDirectionLabel = (direction) =>
  direction === "A_TO_B" ? "앞면 -> 뒷면" : "뒷면 -> 앞면";

function shuffle(items) {
  const cloned = [...items];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = cloned[index];

    cloned[index] = cloned[randomIndex];
    cloned[randomIndex] = current;
  }

  return cloned;
}

