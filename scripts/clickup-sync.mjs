import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const CLICKUP_API = "https://api.clickup.com/api/v2";

const token = process.env.CLICKUP_TOKEN;
const taskId = process.env.CLICKUP_TASK_ID;
const runUrl = process.env.GITHUB_RUN_URL;
const testStatus = process.env.TEST_STATUS;

if (!taskId) {
  console.log("CLICKUP_TASK_ID is missing; skipping ClickUp sync.");
  process.exit(0);
}

if (!token) {
  console.log("CLICKUP_TOKEN is missing; skipping ClickUp sync.");
  process.exit(0);
}

async function clickup(path, options = {}) {
  const response = await fetch(`${CLICKUP_API}${path}`, {
    ...options,
    headers: { Authorization: token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ClickUp API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function updateStatus(status) {
  return clickup(`/task/${taskId}`, { method: "PUT", body: JSON.stringify({ status }) });
}

function addComment(commentText) {
  return clickup(`/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: commentText, notify_all: false })
  });
}

async function addAttachment(filePath) {
  if (!filePath) throw new Error("CLICKUP_ATTACHMENT_PATH is missing");
  const file = await readFile(filePath);
  const form = new FormData();
  form.append("attachment", new Blob([file]), basename(filePath));

  const response = await fetch(`${CLICKUP_API}/task/${taskId}/attachment`, {
    method: "POST",
    headers: { Authorization: token },
    body: form
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ClickUp API ${response.status}: ${text}`);
  const attachment = text ? JSON.parse(text) : {};
  console.log(`Attached ${attachment.title || basename(filePath)} to ClickUp task ${taskId}.`);
}

const command = process.argv[2];
if (command === "start") {
  const status = process.env.CLICKUP_STARTED_STATUS || "in progress";
  await updateStatus(status);
  await addComment(["🤖 Playwright automation started.", "", `GitHub Actions run: ${runUrl || "not available"}`].join("\n"));
  console.log(`ClickUp task ${taskId} marked as ${status}.`);
} else if (command === "finish") {
  if (!testStatus) throw new Error("TEST_STATUS is missing");
  const passed = testStatus === "passed" || testStatus === "success";
  const status = passed ? process.env.CLICKUP_PASSED_STATUS || "complete" : process.env.CLICKUP_FAILED_STATUS || "failed";
  await updateStatus(status);
  await addComment([
    passed ? "✅ Playwright tests passed." : "❌ Playwright tests failed.",
    "",
    `Status: ${status}`,
    `GitHub Actions run: ${runUrl || "not available"}`,
    "",
    "Download the HTML report from the workflow artifacts."
  ].join("\n"));
  console.log(`ClickUp task ${taskId} marked as ${status}.`);
} else if (command === "attach") {
  await addAttachment(process.env.CLICKUP_ATTACHMENT_PATH);
} else {
  throw new Error("Usage: node scripts/clickup-sync.mjs start|finish|attach");
}
