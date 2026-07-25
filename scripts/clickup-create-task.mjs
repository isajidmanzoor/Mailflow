const CLICKUP_API = "https://api.clickup.com/api/v2";

const token = process.env.CLICKUP_TOKEN;
const listId = process.env.CLICKUP_LIST_ID;
if (!token) throw new Error("CLICKUP_TOKEN is missing");
if (!listId) throw new Error("CLICKUP_LIST_ID is missing");

const body = {
  name: process.env.TASK_NAME || "Automated Playwright QA task",
  description: process.env.TASK_DESCRIPTION || "",
  notify_all: false
};
if (process.env.CLICKUP_ASSIGNEE_ID) body.assignees = [Number(process.env.CLICKUP_ASSIGNEE_ID)];

const response = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
  method: "POST",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
const text = await response.text();
if (!response.ok) throw new Error(`ClickUp API ${response.status}: ${text}`);
const task = JSON.parse(text);
console.log(JSON.stringify({ id: task.id, name: task.name, url: task.url }, null, 2));
