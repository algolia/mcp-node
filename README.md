# Algolia NodeJS MCP implementation

- [Running the MCP Server (Mac Only)](#running-the-mcp-server-mac-only)
- [What can I ask for?](#what-can-i-ask-for)
  - [Account](#account)
  - [Apps](#apps)
  - [Search](#search)
  - [AB Testing](#ab-testing)
  - [Analytics](#analytics)
  - [Monitoring](#monitoring)
- [CLI options](#cli-options)
  - [List available commands](#list-available-commands)
  - [Server options](#server-options)
- [Setup dev environment](#setup-dev-environment)

## Running the MCP Server (Mac Only)

1. Download the latest version of the Algolia MCP server at https://github.com/algolia/mcp-node/releases

2. Extract the Zip file

3. From a terminal, run `xattr -r -d com.apple.quarantine <path_to_executable>`

> [!IMPORTANT]
> Why do you need to run this command?
> This executable is not signed because I don't have a payed Apple Developer Account.
> This means that MacOs will "quarantine" it by default when it is downloaded from the internet.
> The command remove the quarantine, allowing you to run the program. If you don't trust the build,
> you can always build it yourself from source with `npm run build` (see development environment setup below) 😄.

4. Configure Claude Desktop

```json
{
  "mcpServers": {
    "algolia-mcp": {
      "command": "<path_to_executable>",
      "args": [
        // See CLI options below
      ]
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

### AB Testing

- "Do I have any AB Tests currently running on application <APPLICATION_ID>?"

### Analytics

- "I have an index named <index_name> on application <application_id>, can you generate a graph for no results rate in DE region over the past month? Please use react and recharts."

### Monitoring

- "Are there any incidents going on at Algolia currently?"

## CLI options

### List available commands

```sh
Usage: algolia-mcp [options] [command]

Options:
  -h, --help              display help for command

Commands:
  start-server [options]  Starts the Algolia MCP server
  authenticate            Authenticate with Algolia
  logout                  Remove all stored credentials
  list-tools              List all available tools
  help [command]          display help for command
```

### Server options

```sh
Usage: algolia-mcp start-server [options]

Starts the Algolia MCP server

Options:
  -o, --allow-tools <tools>  Comma separated list of tool ids (default:
                             ["listIndices","getSettings","searchSingleIndex","getTopSearches","getTopHits","getNoResultsRate"])
  -h, --help                 display help for command
```

## Setup dev environment

You need at least Node 22

```sh
git clone https://github.com/algolia/mcp-node
cd mcp-node
npm i
```

And then you'll need to configure Claude Desktop like so:

```json
{
  "mcpServers": {
    "algolia-mcp": {
      "command": "<PATH_TO_BIN>/node",
      "args": [
        "--experimental-strip-types",
        "--no-warnings=ExperimentalWarning",
        "<PATH_TO_PROJECT>/src/app.ts"
      ]
    }
  }
}
```

> [!TIP]
> You'll need to restart Claude Desktop every time you make a modification.
