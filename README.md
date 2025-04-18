# 🔍 Algolia Node.js MCP

> Connect Claude Desktop to your Algolia data using the Model Context Protocol (MCP)

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-usage-examples">Usage Examples</a> •
  <a href="#-installation">Installation</a> •
  <a href="#%EF%B8%8F-configuration">Configuration</a> •
  <a href="#-development">Development</a> •
  <a href="#-troubleshooting">Troubleshooting</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-license">License</a>
</p>

https://github.com/user-attachments/assets/c36a72e0-f790-4b3f-8720-294ab7f5f6eb

## ✨ Quick Start

1. **Download** the latest release from our [GitHub Releases](https://github.com/algolia/mcp-node/releases)
2. **Authenticate** with your Algolia account
3. **Connect** to Claude Desktop
4. Start asking questions about your Algolia data!

> [!NOTE]
> For step-by-step instructions, follow the [installation guide](#-installation) and [configuration for Claude Desktop](#%EF%B8%8F-configuration).

## 🚀 Features

Algolia Node.js MCP enables natural language interactions with your Algolia data through Claude Desktop. This implementation allows you to:

- **Search and manipulate** indices with natural language
- **Analyze** search metrics and performance
- **Monitor** application status and incidents
- **Visualize** your data with AI-generated charts and graphs
- **Integrate** seamlessly with Claude Desktop through the Model Context Protocol

## 🔮 Usage Examples

Here are some example prompts to get you started:

### Account Management
```
"What is the email address associated with my Algolia account?"
"How many API keys do I have in my account?"
```

### Applications
```
"List all my Algolia apps and their creation dates."
"What indices are in my 'E-commerce' application?"
"Show me the configuration for my 'products' index."
```

### Search & Indexing
```
"Search my 'products' index for Nike shoes under $100."
"Add these 10 books to my 'library' index using their ISBNs as objectIDs."
"How many records do I have in my 'customers' index?"
```

### Analytics & Insights
```
"Generate a chart showing my search volume for the past month."
"What's the no-results rate for my 'products' index in the EU region? Generate a graph using React and Recharts."
"Show me the top 10 searches with no results from last week."
```

### Monitoring & Performance
```
"Are there any ongoing incidents at Algolia?"
"What's the current latency for my US application?"
"Show me a visualization of my API usage over the past week."
```

> [!TIP]
> Try providing your specific application and index in your initial prompt to avoid unnecessary back and forth.

## 📦 Installation

### macOS

1. Download the latest release from [GitHub Releases](https://github.com/algolia/mcp-node/releases)
2. Extract the `.zip` file
3. From your terminal, remove quarantine flag to allow execution:
   ```sh
   xattr -r -d com.apple.quarantine <path_to_executable>
   ```
   > **Note:** This step is necessary as the executable is not signed with an Apple Developer account. If you prefer, you can build from source instead.
4. Run the authentication command:
   ```sh
   <path_to_executable> authenticate
   ```
   This will open your browser to authenticate with the Algolia Dashboard.

### Windows & Linux

*Coming soon.*

## ⚙️ Configuration

### Claude Desktop Setup

1. Open Claude Desktop settings
2. Add the following to your configuration:
   ```json
   {
     "mcpServers": {
       "algolia-mcp": {
         "command": "<path_to_executable>"
       }
     }
   }
   ```
3. Restart Claude Desktop

> [!TIP]
> You can refer to the [official documentation](https://modelcontextprotocol.io/quickstart/user) for Claude Desktop.

### CLI Options

#### Available Commands

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

#### Server Options

```sh
Usage: algolia-mcp start-server [options]

Starts the Algolia MCP server

Options:
  -o, --allow-tools <tools>  Comma separated list of tool ids (default:
                             ["listIndices","getSettings","searchSingleIndex","getTopSearches","getTopHits","getNoResultsRate"])
  -h, --help                 display help for command
```

## 🛠 Development

### Requirements

- Node.js 22 or higher
- npm

### Setup Development Environment

1. Clone the repository:
   ```sh
   git clone https://github.com/algolia/mcp-node
   cd mcp-node
   npm install
   ```

2. Configure Claude Desktop for development:
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

> **Note:** You'll need to restart Claude Desktop after making code changes.

### Build

```sh
npm run build -- --outfile dist/algolia-mcp
```

### Testing and Debugging

Use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) for testing and debugging:

1. Run the debug script:
   ```sh
   cd mcp-node
   npm run debug
   ```

2. Open http://127.0.0.1:6274/ in your browser
3. Click **Connect** to start the server
4. Send test requests through the inspector interface

## 🔧 Troubleshooting

### Common Issues

- **"App not responding" error:** Ensure you've removed the quarantine attribute on macOS
- **Authentication failures:** Try logging out and authenticating again
- **Claude can't access tools:** Verify your MCP configuration in Claude Desktop settings

### Logs and Diagnostics

Log files are stored in:
- macOS: `~/Library/Logs/algolia-mcp/`
- Windows: `%APPDATA%\algolia-mcp\logs\`
- Linux: `~/.config/algolia-mcp/logs/`

## 👥 Contributing

We welcome contributions to Algolia Node.js MCP! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

---

<p align="center">
  Made with ❤️ by Algolia
</p>
