import fs from "fs";
import { parse } from "csv-parse/sync";

// Load the CSV
const csvData = fs.readFileSync("jira_stage_times.csv", "utf8");
const records = parse(csvData, {
  columns: true,
  skip_empty_lines: true,
});

// Group by status
const stageStats = {};

records.forEach((row) => {
  const status = row.status;
  const hours = parseFloat(row.hoursSpent);

  if (!stageStats[status]) {
    stageStats[status] = { total: 0, count: 0, max: 0 };
  }

  stageStats[status].total += hours;
  stageStats[status].count += 1;
  stageStats[status].max = Math.max(stageStats[status].max, hours);
});

// Compute averages
Object.keys(stageStats).forEach((status) => {
  stageStats[status].avg = stageStats[status].total / stageStats[status].count;
});

// Find Longest Stage (highest average)
const longestStage = Object.entries(stageStats).reduce((a, b) =>
  a[1].avg > b[1].avg ? a : b
);

// Find Max Task Age (oldest item)
const maxTaskAge = Object.entries(stageStats).reduce((a, b) =>
  a[1].max > b[1].max ? a : b
);

console.log("📊 Stage Statistics:");
console.table(
  Object.entries(stageStats).map(([status, stats]) => ({
    Stage: status,
    TotalHours: stats.total.toFixed(2),
    TotalDays: (stats.total / 24).toFixed(2),
    Count: stats.count,
    MaxHours: stats.max.toFixed(2),
    MaxDays: (stats.max / 24).toFixed(2),
    AvgHours: stats.avg.toFixed(2),
    AvgDays: (stats.avg / 24).toFixed(2),
  }))
);

console.log(
  `⏱️ Longest Stage: "${longestStage[0]}" with avg ${(
    longestStage[1].avg / 24
  ).toFixed(2)} days`
);

console.log(
  `🏆 Max Task Age: "${maxTaskAge[0]}" had the oldest item: ${(
    maxTaskAge[1].max / 24
  ).toFixed(2)} days`
);
