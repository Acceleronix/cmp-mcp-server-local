# CMP MCP Server (DXT Package)

A Model Context Protocol (MCP) server for managing SIM cards and eUICC devices through the CMP (Connectivity Management Platform) API. This DXT package provides seamless integration with Claude Desktop to query and manage cellular devices through natural language commands.

## Features

- **SIM Card Management**: Query SIM cards with advanced filtering and cursor-based pagination
- **eUICC Device Management**: Manage eSIM profiles and query device status
- **Data Usage Tracking**: Monitor SIM card data consumption by month
- **Token Optimization**: Compact response formats to reduce AI token usage
- **Comprehensive Statistics**: Get insights into eUICC profile distributions
- **✅ Production Ready**: Fully tested with cursor-based pagination following MCP best practices

## Prerequisites

### Get CMP Platform API Credentials

Before you can use this MCP server, you need to obtain API credentials from the CMP platform:

#### Step 1: Access CMP Platform
1. **Sign in to CMP Platform**: Visit your CMP platform instance (e.g., `https://cmp.acceleronix.io`)
2. **Navigate to API Settings**: Access the API management or developer section

#### Step 2: Create API Application
1. **Create API Credentials**:
   - Navigate to the API credentials or application management section
   - Create a new API application or service account
   - Note down your `API Key` and `API Secret`

#### Step 3: Configure API Access
2. **Set API Permissions**:
   - Ensure your API credentials have access to:
     - SIM card query APIs
     - eUICC device management APIs
     - Data usage reporting APIs
   - Configure appropriate access scopes based on your needs

#### Step 4: Note API Endpoint
3. **Get API Endpoint URL**:
   - Note your CMP API endpoint (e.g., `https://cmp.acceleronix.io/gateway/openapi`)
   - This will be used to configure the extension

## Installation

### DXT Package Installation for Claude Desktop

1. Download the `cmp-mcp-server-1.0.0.dxt` file from this repository
2. Open Claude Desktop
3. Go to Settings → Extensions
4. Click "Install from DXT file" and select the downloaded DXT file
5. Configure your environment variables in the extension settings:
   - `CMP_API_KEY`: Your CMP API authentication key (obtained from Step 2 above)
   - `CMP_API_SECRET`: Your CMP API authentication secret (obtained from Step 2 above)
   - `CMP_API_ENDPOINT`: Your CMP API endpoint URL (optional, default: `https://cmp.acceleronix.io/gateway/openapi`)

## Available Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `query_sim_list` | Query SIM cards with pagination and filtering | `cursor`, `pageSize`, `format`, `simState`, `iccid` ranges |
| `query_sim_detail` | Get detailed information about a specific SIM card | `iccid` (required) |
| `query_sim_usage` | Query SIM card data usage for a specific month | `iccid`, `month` (yyyyMM format) |
| `query_euicc_list` | Query eUICC devices with pagination and filtering | `cursor`, `pageSize`, `format`, `profileStatus` |
| `euicc_profile_stats` | Get statistical overview of eUICC profile distribution | `maxResults`, `format` |

## Usage Examples

### Natural Language Commands in Claude Desktop

**SIM Card Management:**
- "Show me all active SIM cards"
- "List SIM cards, 20 per page in compact format"
- "Get details for SIM card with ICCID 8932042000002328543"
- "Show me the next page of SIM results"

**Data Usage Monitoring:**
- "What's the data usage for SIM 8932042000002328543 in January 2024?"
- "Show me usage statistics for this SIM last month"

**eUICC Device Management:**
- "List all eUICC devices"
- "Show me eUICC devices with active profiles"
- "Get eUICC profile statistics for the first 100 devices"

**Advanced Filtering:**
- "Find SIM cards expiring between 2024-01-01 and 2024-12-31"
- "Show me SIM cards with state 6 (Active)"
- "List SIM cards by enterprise data plan"

### Response Formats

The extension supports two response formats:

**Compact Format** (Optimized for token efficiency):
```
📊 SIM List (Page 1/5, Total: 42)
1. 8932042000002328543 | Active | Enterprise Plan A
2. 8932042000002328544 | Standby | Enterprise Plan B
🔄 More data available. Use cursor: eyJwYWdlTnVtIjoyfQ...
```

**Detailed Format** (Complete information):
```
📊 SIM Query Results
├─ Current Page: 1
├─ Total Pages: 5
├─ Total Records: 42

🔍 Found 2 SIM cards:

1. 📱 ICCID: 8932042000002328543
   ├─ Status: Active
   ├─ Enterprise: Acceleronix Corp
   └─ Data Plan: Enterprise Plan A
```

## Configuration Requirements

Make sure to configure the following environment variables in Claude Desktop extension settings:

- **CMP_API_KEY**: Your CMP platform API key (required)
- **CMP_API_SECRET**: Your CMP platform API secret (required)
- **CMP_API_ENDPOINT**: Your CMP API endpoint URL (optional, defaults to production)

### Smart Defaults (No Configuration Needed)

The extension uses intelligent defaults that optimize for token efficiency and API performance:

- **Page Size**: 10 items for SIM/eUICC queries (can override per request: 1-50)
- **Stats Max Results**: 100 items for statistical queries (can override per request: up to 200)
- **Response Format**: Compact format by default (can override to "detailed" per request)

These defaults follow MCP best practices and can be customized on a per-request basis without requiring configuration.

## Troubleshooting

### Common Issues

1. **Authentication Error**: Verify your `CMP_API_KEY` and `CMP_API_SECRET` are correct from your CMP platform
2. **Connection Failed**: Check that `CMP_API_ENDPOINT` is accessible and properly formatted (include `/gateway/openapi` path)
3. **SIM Not Found**: Ensure the ICCID exists and your credentials have access to query it
4. **Invalid Month Format**: Use yyyyMM format for month parameter (e.g., "202401" for January 2024)
5. **Rate Limiting**: Reduce page sizes or add delays between requests if you encounter rate limits

## ✅ Tested & Verified

This MCP server has been thoroughly tested and successfully:

- **✅ Cursor-based Pagination**: Implements efficient pagination following MCP best practices
- **✅ SIM Card Queries**: Successfully retrieves and formats SIM card information
- **✅ eUICC Management**: Provides accurate eUICC device status and profile statistics
- **✅ Data Usage Tracking**: Correctly reports monthly data consumption
- **✅ Token Optimization**: Compact format significantly reduces token usage for AI assistants
- **✅ Error Handling**: Robust error handling for various API response scenarios

## Development

### Project Structure
```
dxt-release/
├── manifest.json          # DXT manifest with extension metadata
├── server/
│   ├── package.json       # Node.js dependencies
│   ├── index.js          # Main MCP server implementation
│   └── cmp-client.js     # CMP API client library
├── LICENSE               # MIT License
└── README.md             # This documentation
```

### Local Development

For development and testing:

1. Clone this repository
2. Install dependencies:
   ```bash
   cd server
   npm install
   ```
3. Create `.env` file with your credentials
4. Test the server:
   ```bash
   node index.js
   ```

## Version

**v1.0.0** - Production-ready release with cursor-based pagination and token optimization

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/cmp-mcp-server/issues)
- Email: support@acceleronix.io
