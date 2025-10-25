# How to Add Supabase MCP to Claude Code

This guide documents the process of setting up the Supabase MCP (Model Context Protocol) server with Claude Code, including common issues and their solutions.

## Prerequisites

- Claude Code installed
- A Supabase account and project
- Node.js and npm installed

## Step 1: Get Your Supabase Personal Access Token

1. Go to https://supabase.com/dashboard/account/tokens
2. Create a new personal access token
3. Save the token (it starts with `sbp_`)

**Important:** You need a personal access token, NOT the service role key from your project settings.

## Step 2: Add the Supabase MCP Server

Run this command in your terminal from your project directory:

```bash
claude mcp add --transport stdio supabase --env SUPABASE_ACCESS_TOKEN=YOUR_TOKEN_HERE -- npx -y @supabase/mcp-server-supabase
```

Replace `YOUR_TOKEN_HERE` with your actual Supabase personal access token.

## Step 3: Verify the Server is Connected

Check the server status:

```bash
claude mcp get supabase
```

You should see:
```
Status: ✓ Connected
```

## Step 4: Restart Claude Code

Completely quit and restart Claude Code for the MCP server to load properly.

## Step 5: Verify MCP Tools are Available

In Claude Code, run the `/mcp` command. You should see the Supabase MCP server listed with all available tools.

## Common Issues and Solutions

### Issue 1: Wrong Package Name

**Error:** `404 Not Found - '@modelcontextprotocol/server-supabase' is not in this registry`

**Solution:** The correct package name is `@supabase/mcp-server-supabase`, not `@modelcontextprotocol/server-supabase`.

### Issue 2: Missing Personal Access Token

**Error:** `Please provide a personal access token (PAT) with the --access-token flag or set the SUPABASE_ACCESS_TOKEN environment variable`

**Solution:** The MCP server requires a personal access token from your Supabase account, not the service role key. Get it from https://supabase.com/dashboard/account/tokens.

### Issue 3: Project Scope vs Local Scope

**Problem:** Server shows as "Connected" but `/mcp` says "No MCP servers configured" and tools don't appear.

**Solution:** Use the CLI command to add to local scope instead of manually editing `.mcp.json`. The local scope configuration (stored in `.claude.json`) is what Claude Code actually reads to expose MCP tools.

**Don't do this (project scope):**
```json
// .mcp.json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

**Do this instead (local scope via CLI):**
```bash
claude mcp add --transport stdio supabase --env SUPABASE_ACCESS_TOKEN=your-token -- npx -y @supabase/mcp-server-supabase
```

### Issue 4: Tools Not Appearing After Restart

**Solution:** Make sure you:
1. Completely quit Claude Code (not just close the window)
2. Restart Claude Code from the project directory where you added the MCP server
3. Start a new conversation
4. Run `/mcp` to verify the server is loaded

## Configuration Methods Tried

### Method 1: Hosted Server (Didn't Work for Local Development)

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

This is the official Supabase hosted MCP server, but it requires OAuth authentication and is primarily designed for remote access scenarios.

### Method 2: Local Server with Environment Variables (Partially Worked)

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "sbp_..."
      }
    }
  }
}
```

The server connected but tools weren't exposed to Claude Code.

### Method 3: CLI Command with Local Scope (This Worked!)

```bash
claude mcp add --transport stdio supabase --env SUPABASE_ACCESS_TOKEN=sbp_... -- npx -y @supabase/mcp-server-supabase
```

This creates a local-scoped configuration that Claude Code properly recognizes and exposes tools.

## Verification

Once successfully configured, you can use Supabase MCP tools in Claude Code:

```
# List all projects
Ask Claude: "List my Supabase projects"

# List all tables
Ask Claude: "Show me all tables in my database"

# Run SQL queries
Ask Claude: "Query the users table"

# Apply migrations
Ask Claude: "Create a migration to add a new column"
```

## Available MCP Tools

The Supabase MCP server provides these capabilities:

- List organizations and projects
- List tables, extensions, and migrations
- Execute SQL queries
- Apply migrations
- Generate TypeScript types
- List and deploy Edge Functions
- Create and manage development branches
- View project logs and advisors

## Security Note

Never connect the MCP server to production data. Supabase MCP is designed for development and testing purposes only.

## Troubleshooting

If you encounter issues:

1. Run `claude mcp get supabase` to check connection status
2. Run `/mcp` in Claude Code to see if tools are loaded
3. Check `~/.claude.json` or your project's `.claude.json` for the configuration
4. Completely restart Claude Code and your computer if needed
5. Remove and re-add the server: `claude mcp remove supabase` then add again

## Related Resources

- [Official Supabase MCP Documentation](https://supabase.com/docs/guides/getting-started/mcp)
- [Claude Code MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)
- [Supabase MCP GitHub](https://github.com/supabase-community/supabase-mcp)
