const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Assertions that read the real interview data, skipped where there is none.
 *
 * A release snapshot exports `shared/` and the editor tree only — deliberately,
 * because a build whose result depended on today's plan.json would not be
 * reproducible from its two commits. So any test that opens `data/interview`
 * passes locally and then fails the build that was meant to ship it. That has
 * now happened twice (banks.test.cjs, behavioural-unit.test.cjs), which is why
 * the pattern lives here instead of being re-derived each time.
 *
 * Use `dataTest` for assertions about the data on disk, and plain `test` for
 * assertions about code. Skips announce the path they looked for, so a skip is
 * never silent.
 */
const DATA = path.resolve(__dirname, '../../../diary/data/interview');

const haveData = fs.existsSync(path.join(DATA, 'plan.json'));

const dataTest = (name, fn) =>
  test(name, {
    skip: haveData
      ? false
      : `no interview data at ${DATA} — expected inside a release build, which snapshots code only`,
  }, fn);

/** Read a JSON file from the interview data directory. Only call inside dataTest. */
const readData = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));

module.exports = { DATA, haveData, dataTest, readData };
