import fs from "fs";
import { parse } from "csv-parse/sync";

// Load data
const records = parse(fs.readFileSync("jira_stage_intervals.csv"), {
  columns: true,
  skip_empty_lines: true,
});

// WIP limits
const WIP_LIMITS = {
  "In Progress": 6,
  "Testing/Review": 3,
};

// Build timeline events
let events = [];
records.forEach((r) => {
  const start = new Date(r.startDate);
  const end = r.endDate ? new Date(r.endDate) : new Date(); // still active
  events.push({ time: start, status: r.status, type: "enter" });
  events.push({ time: end, status: r.status, type: "exit" });
});

// Sort by time
events.sort((a, b) => a.time - b.time);

let counts = {};
let violations = {};

events.forEach((e) => {
  const col = e.status;
  if (!counts[col]) counts[col] = 0;
  if (!violations[col])
    violations[col] = {
      overLimit: 0,
      total: 0,
      longest: 0,
      currentStart: null,
    };

  if (e.type === "enter") counts[col]++;
  else counts[col]--;

  // Check violation
  const limit = WIP_LIMITS[col];
  const over = counts[col] > limit;

  if (over && !violations[col].currentStart) {
    violations[col].currentStart = e.time;
  } else if (!over && violations[col].currentStart) {
    const duration =
      (e.time - violations[col].currentStart) / (1000 * 60 * 60 * 24);
    violations[col].longest = Math.max(violations[col].longest, duration);
    violations[col].overLimit++;
    violations[col].currentStart = null;
  }
});

// Print summary
for (let col in violations) {
  console.log(`\n${col} (Limit: ${WIP_LIMITS[col]})`);
  console.log(`- Violations: ${violations[col].overLimit}`);
  console.log(
    `- Longest Violation: ${violations[col].longest.toFixed(2)} days`
  );
}
