import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { z } from "zod";

type ToolArgs = Record<string, unknown>;

const SYSTEM_PROMPT = `You are CodeLoom's repository question agent.

Use the repository tools before answering. Every answer must be grounded in tool results.
For a selected file, always call file_details first, then answer from its returned role, exports, imports, and usage. Never claim to have read source contents.
This is a graph-facts agent, not a filesystem agent. Never call read_file, ls, glob, grep, write_file, edit_file, execute, or any other built-in filesystem tool.
For a selected file or folder, use the path stated in the user's message and call direct_neighbours, dependency_walk, or search_files as appropriate. Do not ask the user to provide the path again.
Never infer an import, dependency, role, route, or file that a tool did not return.
If the graph cannot answer a question, say that plainly and explain which repository facts are available instead.
Do not review code quality, suggest improvements, or discuss your own model, tools, credentials, or plumbing.
The analysis scope is inside the signed credential; never ask the user for an analysis id.
Keep answers concise and put repository paths in backticks.`;

export function createRepositoryAgent(credential = process.env.AGENT_BOOTSTRAP_CREDENTIAL ?? "") {
  const call = (action: string, args: ToolArgs = {}) =>
    fetch(process.env.CODELOOM_DATA_URL?.trim() || "http://localhost:3000/api/agent/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential, action, args }),
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(typeof body === "object" && body !== null && typeof Reflect.get(body, "error") === "string" ? Reflect.get(body, "error") : "Repository lookup failed");
      return JSON.stringify(body).slice(0, 12000);
    });

  const tools = [
    tool(({ path }) => call("file_details", { path }), { name: "file_details", description: "Return verified parser facts for one selected file: role, exports, imports, importers, size, and entry-point reachability.", schema: z.object({ path: z.string() }) }),
    tool(() => call("summary"), { name: "analysis_summary", description: "Return the whole analysis summary, coverage, projects, and repository rankings.", schema: z.object({}) }),
    tool(({ query }) => call("search_files", { query }), { name: "search_files", description: "Find parsed files whose repository-relative path contains a substring.", schema: z.object({ query: z.string() }) }),
    tool(({ role }) => call("files_by_role", { role }), { name: "files_by_role", description: "List parsed files with an exact parser or model role.", schema: z.object({ role: z.string() }) }),
    tool(({ path }) => call("neighbours", { path }), { name: "direct_neighbours", description: "List the files a file imports and the files importing it.", schema: z.object({ path: z.string() }) }),
    tool(({ path, direction }) => call("walk", { path, direction }), { name: "dependency_walk", description: "Walk the existing graph up to the fixed depth in either dependency direction.", schema: z.object({ path: z.string(), direction: z.enum(["dependents", "dependencies"]) }) }),
    tool(() => call("routes"), { name: "route_table", description: "Return the exact route table and route coverage report.", schema: z.object({}) }),
  ];

  return createAgent({
    model: new ChatOpenAI({
      model: process.env.GROQ_AGENT_MODEL?.trim() || "openai/gpt-oss-20b",
      apiKey: process.env.GROQ_API_KEY?.trim(),
      temperature: 0,
      maxTokens: 256,
      configuration: { baseURL: "https://api.groq.com/openai/v1" },
    }),
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });
}
