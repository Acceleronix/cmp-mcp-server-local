# Acceleronix CMP MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Local%20Server-blue.svg)](https://modelcontextprotocol.io/)

A Model Context Protocol (MCP) server for managing Acceleronix CMP (Connectivity Management Platform) SIM cards and eUICC/eSIM devices. This server provides seamless integration with AI assistants like Claude Desktop and Cursor to query and manage cellular IoT devices through natural language commands.

> 🚀 **Ready to use**: Pre-built DXT package available in `dxt-release/` folder

> 🧠 **Fully Local**: Node.js process runs via stdio, credentials stay only on your computer

> 🔧 **Developer friendly**: TypeScript source + Biome + tsconfig, easy to extend and refactor

## ✨ Features

- 📋 **SIM List**: Paginated / Cursor-based queries with multiple filters (state, ICCID, data plan, etc.); provides both compact and detailed output formats.
- 📱 **SIM Details**: Display complete attributes including MSISDN, IMEI, activation/expiration time, recent sessions, etc.
- 📊 **Usage Analysis**: Query monthly data usage, remaining data, and package details for a specific month.
- 📡 **eUICC / eSIM**: Paginated eUICC Profile viewing with enterprise and status filtering, plus statistical summaries.
- 🧰 **Debug Tools**: `debug_config` for quickly checking environment variable loading and troubleshooting configuration issues.

## 🔑 Prerequisites

Before using this MCP server, you need to obtain API credentials from the Acceleronix CMP platform.

### Get CMP API Credentials

#### Step 1: Access API Configuration
1. **Log in** to your [Acceleronix CMP account](https://cmp.acceleronix.io/)
2. Navigate to **"Enterprises"** menu → **"Enterprise Config"** → Click **"API Configuration"**
3. Enable API and related API permissions.

#### Step 2: Obtain API Parameters
On the API Configuration page, you can find:

- **AppKey** (CMP_API_KEY): Unique identifier associated with your API access. It's used with an AppSecret to encrypt and sign the request.

- **AppSecret** (CMP_API_SECRET): Secret key used to encrypt and sign requests

- **Endpoint URL** (CMP_API_ENDPOINT): The domain name or IP address of the server hosting the REST service endpoint.

Click the **Copy Button** to obtain the complete information for each parameter.

## 📦 Installation Methods

This MCP server supports two installation methods:

### 🚀 Method 1: DXT Package for Claude Desktop (Recommended)

The quickest way to get started - no build process required!

#### Installation Steps

1. **Download DXT Package**

   ```bash
   # Navigate to the dxt-release folder
   cd dxt-release/

   # The pre-built DXT file is ready to use
   ls cmp-mcp-server-1.0.0.dxt
   ```

2. **Install in Claude Desktop**
   - Open Claude Desktop
   - Go to **Settings** → **Extensions** → **Advanced Settings**
   - Click **"Install Install Extension"**
   - Select `cmp-mcp-server-1.0.0.dxt`

3. **Configure API Credentials**
   - Fill in your **CMP API Key** (from Prerequisites)
   - Fill in your **CMP API Secret** (from Prerequisites)
   - Optionally set **CMP API Endpoint** (defaults to `https://cmp.acceleronix.io/gateway/openapi`)
   - Credentials are saved locally in Claude Desktop
   - Switch on to enable the Extensions.

4. **Start Using**
   - Open a new conversation in Claude Desktop
   - Click the **"+"** button in the bottom-left corner
   - Select **"Connectors"** from the menu
   - In the connectors panel, find **"CMP MCP Server"**
   - Toggle the switch to **ON** (blue) to enable the server
   - The extension is now ready to use!
   - Try: "List all SIM cards in Active state"

📁 **What's included**: The `dxt-release/` folder contains the complete DXT package with documentation, compiled code, and all dependencies - no additional setup required!

#### Rebuilding DXT Package (Optional)

If you need to rebuild the DXT package:

```bash
cd dxt-release
./setup.sh          # Install server dependencies + initialize .env
node test-server.js # Local smoke test for MCP Server
dxt pack .          # Regenerate DXT package
```

### 🛠️ Method 2: Local MCP Server Installation

For advanced users or integration with other MCP-compatible tools like **Cursor**, **Trae**, etc.

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Installation Steps

```bash
# Clone the repository
git clone <repository-url>
cd cmp-mcp-server-local

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env: Fill in CMP_API_KEY / CMP_API_SECRET

# Build the project
npm run build
```

#### MCP Server Configuration

**For Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cmp-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/cmp-mcp-server-local/dist/index.js"],
      "env": {
        "CMP_API_KEY": "your_api_key_here",
        "CMP_API_SECRET": "your_api_secret_here",
        "CMP_API_ENDPOINT": "https://cmp.acceleronix.io/gateway/openapi"
      }
    }
  }
}
```

**For Cursor** (MCP settings):

```json
{
  "mcpServers": {
    "cmp-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/cmp-mcp-server-local/dist/index.js"],
      "env": {
        "CMP_API_KEY": "your_api_key_here",
        "CMP_API_SECRET": "your_api_secret_here",
        "CMP_API_ENDPOINT": "https://cmp.acceleronix.io/gateway/openapi"
      }
    }
  }
}
```

💡 **Configuration Tips**:

- Replace `/absolute/path/to/cmp-mcp-server-local` with your actual project path
- Replace `your_api_key_here` and `your_api_secret_here` with credentials from Prerequisites
- The `CMP_API_ENDPOINT` is required and defaults to the production endpoint
- See `docs/claude-desktop-config.example.json` and `docs/cursor-config.example.json` for complete examples

## ⚙️ Environment Variables

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `CMP_API_KEY` | CMP application AppKey | ✅ | - |
| `CMP_API_SECRET` | CMP application AppSecret | ✅ | - |
| `CMP_API_ENDPOINT` | API base URL | ✅| `https://cmp.acceleronix.io/gateway/openapi` |
| `DEFAULT_PAGE_SIZE` | Default page size (1-50) | ❌ | `10` |
| `DEFAULT_FORMAT` | Default output format: `compact` / `detailed` | ❌ | `compact` |

> Local `.env` provides a template; Claude / Cursor can pass variables with the same names directly in the `env` field of their configurations.

## 🧠 Available MCP Tools

| Tool | Purpose | Key Parameters |
| --- | --- | --- |
| `query_sim_list` | Get paginated SIM list (supports cursor / multi-condition filtering) | `cursor`, `pageSize`, `format`, `simState`, `enterpriseDataPlan`, `iccidStart`, `iccidEnd`, `label`, etc. |
| `query_sim_detail` | View complete information for a single SIM | `iccid` |
| `query_sim_usage` | Monthly usage and package details | `iccid`, `month(yyyyMM)` |
| `query_euicc_list` | eUICC / eSIM Profile list | `cursor`, `pageSize`, `format`, `childEnterpriseId`, `iccid`, `profileStatus` |
| `euicc_profile_stats` | eUICC status/enterprise distribution statistics | `maxResults`, `format` |
| `debug_config` | Output current configuration and environment variables | None |

## 💡 Usage Examples

### Natural Language Commands

Once configured, you can use natural language to interact with your SIM cards and eSIM devices:

**SIM Management:**

- "List all SIM cards in Active state"
- "Show me SIMs using the 'Quec_B1_EU_100M_12Month_Test_6Month_100M_2025021336' data plan."
- "Get details for ICCID 8932042000001790171"

**Usage Analytics:**

- "Query usage details for ICCID 8932042000001790171 in December 2025"
- "How much data has the SIM(ICCID 8932042000001790171) used this month?"
- "Show me data usage for December 2025"

**eSIM / eUICC Management:**

- "Show statistics on how many eUICC Profiles are Enabled vs Disabled"
- "List all eSIM profiles"
- "Paginate 20 eUICCs in detailed format"

## 📁 Project Structure

```
.
├── src/                        # TypeScript source (local MCP Server)
│   ├── index.ts                # stdio entry point + tool definitions
│   └── cmp_client.ts           # CMP API client
├── dist/                       # npm run build output
├── docs/                       # MCP client configuration examples
│   ├── claude-desktop-config.example.json
│   └── cursor-config.example.json
├── dxt-release/                # Claude Desktop DXT resources
│   ├── cmp-mcp-server-1.0.0.dxt
│   ├── README.md
│   ├── server/
│   └── setup.sh
├── .env.example                # Environment template (local only)
├── package.json                # npm scripts + dependencies
├── tsconfig.json               # TypeScript compilation config
└── README.md                   # This document
```

## 🧑‍💻 Development Scripts

```bash
npm run dev        # Run locally using tsx watch
npm run serve      # Start directly via tsx (no build)
npm run build      # Generate dist/index.js
npm run start      # Run compiled version
npm run format     # Biome formatting
npm run lint:fix   # Biome Lint + auto-fix
npm run type-check # tsc --noEmit type checking
```

## 🔍 Troubleshooting Guide

| Issue | Solution |
| --- | --- |
| ❌ **Authentication Error** | Verify `CMP_API_KEY` and `CMP_API_SECRET` are correct from your CMP platform API Configuration page |
| 🔗 **Cannot access CMP** | Verify `CMP_API_ENDPOINT` is directed to the correct domain name or IP address for the server hosting the REST service, or troubleshoot any local or corporate network proxy issues. |
| 📭 **Empty SIM list** | Ensure in CMP platform: API permissions are authorized in "API Configuration" setting. |
| 🧩 **MCP client cannot connect** | Ensure command points to `node dist/index.js` and process stays running |
| 🔧 **Configuration issues** | Use the `debug_config` tool to check if environment variables are loaded correctly |

💡 **Pro tip**: Use the `debug_config` tool to quickly verify your configuration and connectivity status.

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.
