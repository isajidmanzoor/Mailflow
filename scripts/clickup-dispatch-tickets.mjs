const CLICKUP_API = "https://api.clickup.com/api/v2";
const GITHUB_API = "https://api.github.com";

const clickupToken = process.env.CLICKUP_TOKEN;
const listId = process.env.CLICKUP_LIST_ID;
const githubToken = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const baseBranch = process.env.BASE_BRANCH || "main";
const maxTickets = Number.parseInt(process.env.MAX_TICKETS || "100", 10);

if (!clickupToken) throw new Error("CLICKUP_TOKEN is missing");
if (!listId) throw new Error("CLICKUP_LIST_ID is missing");
if (!githubToken) throw new Error("GH_TOKEN is missing");
if (!repository?.includes("/")) throw new Error("GITHUB_REPOSITORY is missing or invalid");
if (!Number.isInteger(maxTickets) || maxTickets < 1 || maxTickets > 100) {
  throw new Error("MAX_TICKETS must be an integer from 1 to 100");
}

async function clickup(path) {
  const response = await fetch(`${CLICKUP_API}${path}`, {
    headers: { Authorization: clickupToken, "Content-Type": "application/json" }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ClickUp API ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function dispatch(taskId) {
  const response = await fetch(
    `${GITHUB_API}/repos/${repository}/actions/workflows/clickup-ticket-pr.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: baseBranch,
        inputs: { clickup_task_id: String(taskId), base_branch: baseBranch, draft: "true" }
      })
    }
  );
  if (!response.ok) throw new Error(`GitHub workflow dispatch ${response.status}: ${await response.text()}`);
}

async function listOpenTasks() {
  const tasks = [];
  for (let page = 0; tasks.length < maxTickets; page += 1) {
    const params = new URLSearchParams({ archived: "false", include_closed: "false", page: String(page) });
    const result = await clickup(`/list/${encodeURIComponent(listId)}/task?${params}`);
    const pageTasks = result.tasks || [];
    tasks.push(...pageTasks);
    if (pageTasks.length === 0 || result.last_page === true) break;
  }
  return tasks.slice(0, maxTickets);
}

const tasks = await listOpenTasks();
for (const task of tasks) await dispatch(task.id);

const summary = `Queued ${tasks.length} ClickUp ticket workflow${tasks.length === 1 ? "" : "s"} from List ${listId}.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then(fs => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## ClickUp ticket sync\n\n${summary}\n`));
}
