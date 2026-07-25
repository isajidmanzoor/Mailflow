const CLICKUP_API = "https://api.clickup.com/api/v2";
const GITHUB_API = "https://api.github.com";

const clickupToken = process.env.CLICKUP_TOKEN;
const taskId = process.env.CLICKUP_TASK_ID;
const githubToken = process.env.GH_TOKEN;

if (!clickupToken) throw new Error("CLICKUP_TOKEN is missing");
if (!taskId) throw new Error("CLICKUP_TASK_ID is missing");
if (!githubToken) throw new Error("GH_TOKEN is missing");

async function request(api, endpoint, options = {}) {
  const response = await fetch(`${api}${endpoint}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${api === CLICKUP_API ? "ClickUp" : "GitHub"} API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function clickup(endpoint, options = {}) {
  return request(CLICKUP_API, endpoint, {
    ...options,
    headers: { Authorization: clickupToken, "Content-Type": "application/json", ...(options.headers || {}) }
  });
}

function github(endpoint, options = {}) {
  return request(GITHUB_API, endpoint, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function githubResponse(endpoint) {
  return fetch(`${GITHUB_API}${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 75) || "untitled";
}

function branchName(task) {
  return `clickup/${task.custom_id || task.id}-${slugify(task.name)}`;
}

function markdownEscape(value = "") {
  return String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function buildTaskDocument(task) {
  const tags = (task.tags || []).map(tag => tag.name).join(", ") || "None";
  const assignees = (task.assignees || []).map(user => user.username || user.email || user.id).join(", ") || "Unassigned";
  return `# ${task.name}

- ClickUp task: ${task.url || "unavailable"}
- Task ID: \`${task.id}\`
- Status: ${task.status?.status || "Unknown"}
- Priority: ${task.priority?.priority || "None"}
- Assignees: ${assignees}
- Tags: ${tags}

## Description

${task.description || "No description provided."}

## Automation

This branch and draft PR were created automatically from ClickUp.

The implementation should:
1. Reproduce the reported issue.
2. Add or update Playwright coverage.
3. Fix the issue.
4. Attach the HTML report to the PR.
5. Update the linked ClickUp task after validation.
`;
}

async function fetchTask() {
  process.stdout.write(JSON.stringify(await clickup(`/task/${taskId}`), null, 2));
}

async function createPullRequest() {
  const task = await clickup(`/task/${taskId}`);
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository?.includes("/")) throw new Error("GITHUB_REPOSITORY is missing or invalid");
  const [owner, repo] = repository.split("/");
  const baseBranch = process.env.BASE_BRANCH || "main";
  const branch = branchName(task);

  const baseRef = await github(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const branchRef = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const branchResponse = await githubResponse(branchRef);
  if (branchResponse.status === 404) {
    await github(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha })
    });
  } else if (!branchResponse.ok) {
    throw new Error(`GitHub API ${branchResponse.status}: ${await branchResponse.text()}`);
  }

  const documentPath = `.clickup/tasks/${task.id}.md`;
  const fileResponse = await githubResponse(`/repos/${owner}/${repo}/contents/${documentPath}?ref=${encodeURIComponent(branch)}`);
  let existingFile;
  if (fileResponse.ok) existingFile = await fileResponse.json();
  else if (fileResponse.status !== 404) throw new Error(`GitHub API ${fileResponse.status}: ${await fileResponse.text()}`);

  await github(`/repos/${owner}/${repo}/contents/${documentPath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `chore: link ClickUp task ${task.id}`,
      content: Buffer.from(buildTaskDocument(task), "utf8").toString("base64"),
      branch,
      ...(existingFile ? { sha: existingFile.sha } : {})
    })
  });

  const pulls = await github(`/repos/${owner}/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(baseBranch)}`);
  const title = `fix: ${task.name}`;
  const body = [
    "## ClickUp task", "", `[Open task in ClickUp](${task.url || "#"})`, "", "### Task details", "",
    "| Field | Value |", "|---|---|",
    `| Task ID | \`${markdownEscape(task.id)}\` |`,
    `| Status | ${markdownEscape(task.status?.status || "Unknown")} |`,
    `| Priority | ${markdownEscape(task.priority?.priority || "None")} |`,
    `| Automation run | ${process.env.GITHUB_RUN_URL} |`, "", "### QA checklist", "",
    "- [ ] Reproduce the issue", "- [ ] Implement the fix", "- [ ] Add or update Playwright coverage",
    "- [ ] Run Playwright successfully", "- [ ] Review the HTML report", "- [ ] Update ClickUp task", "",
    "This PR was created automatically from ClickUp."
  ].join("\n");

  let pullRequest = pulls.find(pull => pull.state === "open");
  if (!pullRequest) {
    pullRequest = await github(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title, head: branch, base: baseBranch, body, draft: process.env.DRAFT_PR !== "false" })
    });
  } else if (pullRequest.state === "open") {
    pullRequest = await github(`/repos/${owner}/${repo}/pulls/${pullRequest.number}`, {
      method: "PATCH",
      body: JSON.stringify({ title, body, base: baseBranch })
    });
  }

  const automationBlock = ["## GitHub automation", `Branch: ${branch}`, `PR: ${pullRequest.html_url}`, `Automation run: ${process.env.GITHUB_RUN_URL}`].join("\n");
  const description = task.description?.includes("## GitHub automation")
    ? task.description.replace(/## GitHub automation[\s\S]*$/, automationBlock)
    : [task.description || "", automationBlock].filter(Boolean).join("\n\n");
  await clickup(`/task/${task.id}`, { method: "PUT", body: JSON.stringify({ description }) });
  await clickup(`/task/${task.id}/comment`, {
    method: "POST",
    body: JSON.stringify({
      comment_text: ["🤖 GitHub branch and draft PR created or updated.", "", `Branch: ${branch}`, `PR: ${pullRequest.html_url}`, `Base branch: ${baseBranch}`].join("\n"),
      notify_all: false
    })
  });
  console.log(`Branch: ${branch}\nPR: ${pullRequest.html_url}`);
}

const command = process.argv[2];
if (command === "fetch") await fetchTask();
else if (command === "create-pr") await createPullRequest();
else throw new Error("Usage: node scripts/clickup-ticket.mjs fetch|create-pr");
