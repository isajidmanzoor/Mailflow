const token = process.env.CLICKUP_TOKEN;

if (!token) throw new Error("CLICKUP_TOKEN is missing");

const response = await fetch("https://api.clickup.com/api/v2/user", {
  headers: { Authorization: token, "Content-Type": "application/json" }
});
const text = await response.text();
if (!response.ok) throw new Error(`ClickUp authentication failed (${response.status}): ${text}`);

const { user } = text ? JSON.parse(text) : {};
if (!user?.id) throw new Error("ClickUp authentication response did not contain a user");

console.log(`Authenticated to ClickUp as ${user.username || "user"} (ID: ${user.id}).`);
