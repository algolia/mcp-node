# Algolia NodeJS MCP implementation

## Installation

You need at least Node 22

```sh
npm i
```

## Claude MCP configuration

```json
{
  "mcpServers": {
    "algolia-mcp": {
      "command": "<PATH_TO_BIN>/node",
      "args": ["--experimental-strip-types", "<PATH_TO_PROJECT>/src/app.ts"]
    }
  }
}
```

## What can I ask for?

Algolia Node MCP lets you interact with your Algolia apps and indices. Here are some example prompts to get you started:

### Account

- "What is the email address associated to my account?"

### Apps

- "List all my apps Algolia apps."
- "List all the apps that I own."
- "What's the ID for app Latency?"

### Search

- "Search all items in the products index of app Latency where brand = 'Nike' and price < 100."
