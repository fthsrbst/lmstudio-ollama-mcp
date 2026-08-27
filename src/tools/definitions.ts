import type { ToolDefinition } from "../providers/base.js";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the workspace. Use for exploring codebase, reading configs, docs.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root or absolute" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates or overwrites. Use for creating new files, fixing code.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to workspace root" },
          content: { type: "string", description: "File content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing exact string. Provide old_string that exists verbatim.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          old_string: { type: "string", description: "Exact string to replace (must appear once)" },
          new_string: { type: "string", description: "Replacement string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a bash command in the workspace. Use for tests, installs, git, builds. Must be non-interactive and safe.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bash command to run" },
          timeout_ms: { type: "integer", description: "Timeout ms (default 30000)", default: 30000 },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files by glob pattern. Fast codebase search.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern like src/**/*.ts" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents with regex. Use for finding symbols, patterns.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern" },
          include: { type: "string", description: "File glob filter, e.g. *.ts" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List directory contents.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (default workspace root)", default: "." },
        },
        required: [],
      },
    },
  },
];

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["function"]["name"];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.function.name === name);
}
