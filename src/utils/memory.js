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

export const buildPracticeDeck = (pairs, limit, mode = "both") => {
  const randomizedDeck = shuffle(
    sortPairs(pairs).flatMap((pair) => {
      if (mode === "front") {
        return [
          {
            id: `${pair.id}-front`,
            pairId: pair.id,
            prompt: pair.left,
            answer: pair.right,
            direction: "A_TO_B",
          },
        ];
      }

      if (mode === "back") {
        return [
          {
            id: `${pair.id}-back`,
            pairId: pair.id,
            prompt: pair.right,
            answer: pair.left,
            direction: "B_TO_A",
          },
        ];
      }

      return [
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
      ];
    })
  );

  if (!Number.isFinite(limit)) {
    return randomizedDeck;
  }

  return randomizedDeck.slice(0, Math.max(1, Math.min(limit, randomizedDeck.length)));
};

export const shuffleItems = (items) => shuffle(items);

export const parseImportedPairs = (text) => {
  const entries = [];
  const invalidLineNumbers = [];

  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((rawLine, index) => {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        return;
      }

      const pair = splitImportedPair(line);

      if (!pair) {
        invalidLineNumbers.push(index + 1);
        return;
      }

      entries.push(pair);
    });

  return { entries, invalidLineNumbers };
};

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

function splitImportedPair(line) {
  const delimitedPair =
    splitByPattern(line, /\t+/) ||
    splitByPattern(line, /\s*\|\s*/) ||
    splitByPattern(line, /\s*::\s*/) ||
    splitByPattern(line, /\s*→\s*/);

  if (delimitedPair) {
    return delimitedPair;
  }

  const tokens = line.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) {
    return null;
  }

  return {
    left: tokens[0].trim(),
    right: tokens.slice(1).join(" ").trim(),
  };
}

function splitByPattern(line, pattern) {
  const matched = line.match(pattern);

  if (!matched || typeof matched.index !== "number") {
    return null;
  }

  const left = line.slice(0, matched.index).trim();
  const right = line.slice(matched.index + matched[0].length).trim();

  if (!left || !right) {
    return null;
  }

  return { left, right };
}

