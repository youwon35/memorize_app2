// Importing restores front/back text into the selected folder; metadata is for reference.
export const createCardExportRows = (pairs, getFolderLabel, getSummary) =>
  pairs.map((pair, index) => {
    const summary = getSummary(pair);
    return {
      No: index + 1,
      Folder: getFolderLabel(pair.folderId),
      Front: pair.left,
      Back: pair.right,
      Attempts: summary.attempts,
      Correct: summary.correct,
      Incorrect: summary.incorrect,
      AccuracyPercent: summary.accuracy ?? "",
      Hidden: summary.hidden ? "Y" : "N",
      CreatedAt: pair.createdAt ?? "",
      UpdatedAt: pair.updatedAt ?? "",
    };
  });
