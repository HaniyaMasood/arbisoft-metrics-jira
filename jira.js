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
function calculateStageTimes(issue) {
  const statusTimes = {};
  const histories = issue.changelog.histories;

  // Sort changelog histories by created date (ascending)
  const sortedHistories = histories.sort(
    (a, b) => new Date(a.created) - new Date(b.created)
  );

  let prevStatus = null;
  let prevDate = null;

  sortedHistories.forEach((history) => {
    history.items.forEach((item) => {
      if (item.field === "status") {
        const toStatus = item.toString;
        const changedAt = new Date(history.created);

        if (prevStatus && prevDate) {
          const diffMs = changedAt - prevDate;
          const diffHours = diffMs / 1000 / 60 / 60;

          if (diffHours > 0) {
            if (!statusTimes[prevStatus]) {
              statusTimes[prevStatus] = 0;
            }
            statusTimes[prevStatus] += diffHours;
          }
        }

        prevStatus = toStatus;
        prevDate = changedAt;
      }
    });
  });

  // Handle last status → resolution date or now
  if (prevStatus && prevDate) {
    // Use resolutiondate if available, otherwise now
    const endDate = issue.fields.resolutiondate
      ? new Date(issue.fields.resolutiondate)
      : new Date();

    const diffMs = endDate - prevDate;
    const diffHours = diffMs / 1000 / 60 / 60;

    if (diffHours > 0) {
      if (!statusTimes[prevStatus]) {
        statusTimes[prevStatus] = 0;
      }
      statusTimes[prevStatus] += diffHours;
    }
  }

  return statusTimes;
}

/**
 * Save results to CSV
 */
function saveResultsToCSV(results, filename = "jira_stage_times.csv") {
  const fields = ["issueKey", "status", "hoursSpent"];
  const rows = [];

  results.forEach((res) => {
    Object.entries(res.statusTimes).forEach(([status, hours]) => {
      rows.push({
        issueKey: res.issueKey,
        status,
        hoursSpent: hours.toFixed(2),
      });
    });
  });

  const csv = parse(rows, { fields });
  fs.writeFileSync(filename, csv);
  console.log(`✅ Results saved to ${filename}`);
}

/**
 * Main
 */
(async () => {
  try {
    const issues = await getAllIssues();

    const results = issues.map((issue) => {
      const statusTimes = calculateStageTimes(issue);
      return { issueKey: issue.key, statusTimes };
    });

    saveResultsToCSV(results);
  } catch (error) {
    console.error(error.response?.data || error.message);
  }
})();
