import { readFileSync } from "node:fs";

const base = new URL(process.env.SUPERPLANE_URL || "http://localhost:8000");
const token = process.env.SUPERPLANE_TOKEN;
const orders = JSON.parse(readFileSync(new URL("../docs/factory/work-orders.json", import.meta.url), "utf8"));
const instructions = readFileSync(new URL("../docs/factory/agent-instructions.md", import.meta.url), "utf8");
const factoryInput = { name: "ClassForward", key: "CF", description: "Build story lessons, shareable notes, and classroom team quizzes through reviewed work orders and verified pull requests." };

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ baseURL: base.origin, factory: factoryInput, setupCommands: ["npm ci"], draftOrders: orders.map(({ title }) => title) }, null, 2));
  process.exit(0);
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("This bootstrap targets local SuperPlane only. Set SUPERPLANE_URL to localhost.");
}
if (!token) throw new Error("Set SUPERPLANE_TOKEN to an organization API token from local SuperPlane. Do not commit or paste it into chat.");

async function request(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`SuperPlane ${body ? "POST" : "GET"} ${path}: HTTP ${response.status}. Check local setup, token permissions, and server logs. Rerun safely after resolving the error.`);
  return response.json();
}

const listed = await request("/api/v1/factories");
let factory = (listed.factories || []).find((item) => item.key === "CF");
if (!factory) factory = (await request("/api/v1/factories", factoryInput)).factory;
if (!factory?.id) throw new Error("SuperPlane did not return a factory ID.");
if (factory.name !== "ClassForward") throw new Error("Workspace key CF belongs to a different workspace. Nothing there was modified.");
const root = `/api/v1/factories/${encodeURIComponent(factory.id)}`;
const listedResources = await request(`${root}/agent-resources`);
const existingSetup = (listedResources.resources || []).find((item) => item.kind === "KIND_SETUP_COMMAND" || item.kind === 3);
if (!existingSetup) {
  await request(`${root}/agent-resources`, { kind: "KIND_SETUP_COMMAND", enabled: true, commands: ["npm ci"] });
} else {
  console.log("Preserved existing workspace setup commands.");
}

const existingTitles = new Set();
let cursor = "";
do {
  const query = new URLSearchParams({ limit: "100", include_archived: "true" });
  if (cursor) query.set("before_id", cursor);
  const page = await request(`${root}/orders?${query}`);
  for (const order of page.orders || []) existingTitles.add(order.title);
  const last = page.orders?.at(-1)?.id;
  if (page.hasNextPage && (!last || last === cursor)) throw new Error("Could not advance work-order pagination. No new orders were added.");
  cursor = page.hasNextPage ? last : "";
} while (cursor);

for (const order of orders) {
  if (existingTitles.has(order.title)) continue;
  await request(`${root}/orders`, { title: order.title, description: `${order.description}\n\n${instructions}` });
  console.log(`Created draft: ${order.title}`);
}
console.log(`Prepared ClassForward workspace ${factory.id}. Finish GitHub and agent onboarding before dispatching. No tasks were dispatched or merged.`);
