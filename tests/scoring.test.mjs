import assert from "node:assert/strict";
import { deriveResultForType, getTopTypes, recordToResult } from "../src/utils/scoring.js";

const tiedScores = { 1: 18, 2: 42, 3: 20, 4: 25, 5: 21, 6: 24, 7: 28, 8: 42, 9: 19 };
assert.deepEqual(getTopTypes(tiedScores), [2, 8]);

const selected = deriveResultForType(tiedScores, 8);
assert.equal(selected.type, 8);
assert.equal(selected.center, "장(본능) 중심");
assert.equal(selected.wingLabel, "8w7");
assert.equal(selected.stress, 5);
assert.equal(selected.growth, 2);

const unresolvedRecord = recordToResult({
  scores: tiedScores,
  type: 2,
  center: "가슴(감정) 중심",
  wing: 1,
  wingLabel: "2w1",
  stress: 8,
  growth: 4,
  topTypes: [2, 8],
  selectedType: null,
});
assert.deepEqual(unresolvedRecord.topTypes, [2, 8]);
assert.equal(unresolvedRecord.selectedType, null);

console.log("Scoring tie scenarios passed");
