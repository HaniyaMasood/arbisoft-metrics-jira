import axios from "axios";
import fs from "fs";
import { parse } from "json2csv";
import dotenv from "dotenv";
dotenv.config();

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.PROJECT_KEY;

const auth = {
  username: JIRA_EMAIL,
  password: JIRA_API_TOKEN,
};

const MAX_RESULTS = 100; // Jira max per request

// Define your WIP limits
const WIP_LIMITS = {
  "In Progress": 6,
  "Testing/Review": 3,
};

/**
 * Fetch all issues with changelog (pagination)
 */
async function getAllIssues() {
  let startAt = 0;
  let allIssues = [];
  let total = 0;

  do {
    const response = await axios.get(`${JIRA_BASE_URL}/rest/api/3/search`, {
      auth,
      params: {
        jql: `project=${PROJECT_KEY}`,
        expand: "changelog",
        startAt,
        maxResults: MAX_RESULTS,
      },
    });

    const { issues } = response.data;
    total = response.data.total;

    allIssues = allIssues.concat(issues);
    startAt += MAX_RESULTS;

    console.log(`Fetched ${allIssues.length}/${total} issues...`);
  } while (allIssues.length < total);

  return allIssues;
}

/**
 * Build a map of issue timelines: status → date ranges
 */
function buildIssueTimeline(issue) {
  const histories = issue.changelog.histories;
  const sortedHistories = histories.sort(
    (a, b) => new Date(a.created) - new Date(b.created)
  );

  const statusTimeline = [];
  let prevStatus = issue.fields.status.name;
  let prevDate = new Date(issue.fields.created);

  sortedHistories.forEach((history) => {
    history.items.forEach((item) => {
      if (item.field === "status") {
        const toStatus = item.toString;
        const changedAt = new Date(history.created);

        statusTimeline.push({
          status: prevStatus,
          start: prevDate,
          end: changedAt,
        });

        prevStatus = toStatus;
        prevDate = changedAt;
      }
    });
  });

  // Add last segment until resolution or now
  const endDate = issue.fields.resolutiondate
    ? new Date(issue.fields.resolutiondate)
    : new Date();
  statusTimeline.push({
    status: prevStatus,
    start: prevDate,
    end: endDate,
  });

  return statusTimeline;
}

/**
 * Aggregate daily WIP counts
 */
function buildDailyWIP(issues) {
  const dailyWIP = {};

  issues.forEach((issue) => {
    const timeline = buildIssueTimeline(issue);

    timeline.forEach(({ status, start, end }) => {
      // Only care about statuses we have limits for
      if (!WIP_LIMITS[status]) return;

      let current = new Date(start);
      current.setHours(0, 0, 0, 0);

      const last = new Date(end);
      last.setHours(0, 0, 0, 0);

      while (current <= last) {
        const dayKey = current.toISOString().split("T")[0]; // YYYY-MM-DD
        if (!dailyWIP[dayKey]) dailyWIP[dayKey] = {};
        if (!dailyWIP[dayKey][status]) dailyWIP[dayKey][status] = 0;

        dailyWIP[dayKey][status] += 1;

        current.setDate(current.getDate() + 1);
      }
    });
  });

  return dailyWIP;
}

/**
 * Count violations per month
 */
function calculateMonthlyViolations(dailyWIP) {
  const monthlyViolations = {};

  Object.entries(dailyWIP).forEach(([day, columns]) => {
    const month = day.slice(0, 7); // YYYY-MM

    Object.entries(columns).forEach(([column, count]) => {
      const limit = WIP_LIMITS[column];
      if (count > limit) {
        const key = `${month}-${column}`;
        if (!monthlyViolations[key]) {
          monthlyViolations[key] = {
            month,
            column,
            violations: 0,
          };
        }
        // Count 1 violation per day per column
        monthlyViolations[key].violations += 1;
      }
    });
  });

  return Object.values(monthlyViolations);
}

/**
 * Save results to CSV
 */
function saveResultsToCSV(results, filename = "jira_wip_violations.csv") {
  const fields = ["month", "column", "violations"];
  const csv = parse(results, { fields });
  fs.writeFileSync(filename, csv);
  console.log(`✅ Results saved to ${filename}`);
}

/**
 * Main
 */
(async () => {
  try {
    const issues = await getAllIssues();

    const dailyWIP = buildDailyWIP(issues);
    const results = calculateMonthlyViolations(dailyWIP);

    saveResultsToCSV(results);
  } catch (error) {
    console.error(error.response?.data || error.message);
  }
})();
