#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { 
  CMPClient, 
  getStateName, 
  getProfileStatusName, 
  getProfileTypeName 
} from "./cmp-client.js";

// DXT configuration - user_config fields from manifest.json become environment variables
const config = {
  cmp_api_key: process.env.CMP_API_KEY,
  cmp_api_secret: process.env.CMP_API_SECRET,
  cmp_api_endpoint: process.env.CMP_API_ENDPOINT || "https://cmp.acceleronix.io/gateway/openapi",
};

const enableDebugLogging = process.env.ENABLE_DEBUG_LOGGING === "true";

// Smart defaults for different query types (following MCP best practices)
const DEFAULTS = {
  SIM_LIST_PAGE_SIZE: 10,      // Small default for token efficiency
  EUICC_LIST_PAGE_SIZE: 10,    // Small default for token efficiency
  STATS_MAX_RESULTS: 100,      // Larger for statistical analysis
  FORMAT: "compact"            // Always use compact format by default
};

// Logger setup
const logger = {
  debug: (...args) => {
    if (enableDebugLogging) {
      console.error("[DEBUG]", new Date().toISOString(), ...args);
    }
  },
  info: (...args) => console.error("[INFO]", new Date().toISOString(), ...args),
  warn: (...args) => console.error("[WARN]", new Date().toISOString(), ...args),
  error: (...args) => console.error("[ERROR]", new Date().toISOString(), ...args),
};

// Initialize CMP client when needed
let cmpClient = null;

function getCMPClient() {
  if (!cmpClient) {
    if (!config.cmp_api_key || !config.cmp_api_secret) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "CMP API credentials not configured. Please configure API Key and Secret in Claude Desktop extension settings."
      );
    }
    cmpClient = new CMPClient(
      config.cmp_api_key,
      config.cmp_api_secret,
      config.cmp_api_endpoint
    );
    cmpClient.setLogger(logger);
    logger.info("CMP client initialized successfully");
  }
  return cmpClient;
}

// Create server instance
const server = new Server(
  {
    name: "cmp-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  {
    name: "query_sim_list",
    description: "Query SIM cards with cursor-based pagination and compact formatting",
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          description: "Pagination cursor for continuing from previous request"
        },
        pageSize: {
          type: "number",
          description: "Records per page, default 10, max 50 (reduced for token efficiency)",
          minimum: 1,
          maximum: 50
        },
        format: {
          type: "string",
          enum: ["compact", "detailed"],
          description: "Response format: 'compact' (default, saves tokens) or 'detailed'"
        },
        enterpriseDataPlan: {
          type: "string",
          description: "Enterprise data plan name"
        },
        expirationTimeStart: {
          type: "string",
          description: "Start expiration date, format: yyyy-MM-dd"
        },
        expirationTimeEnd: {
          type: "string",
          description: "End expiration date, format: yyyy-MM-dd"
        },
        iccidStart: {
          type: "string",
          description: "ICCID start number"
        },
        iccidEnd: {
          type: "string",
          description: "ICCID end number"
        },
        label: {
          type: "string",
          description: "Label"
        },
        simState: {
          type: "number",
          description: "SIM state (2:Pre-activation 3:Test 4:Silent 5:Standby 6:Active 7:Shutdown 8:Pause 10:Pre-logout 11:Logout)"
        },
        simType: {
          type: "string",
          description: "SIM card type"
        }
      }
    }
  },
  {
    name: "query_sim_detail",
    description: "Get detailed information about a specific SIM card by ICCID",
    inputSchema: {
      type: "object",
      properties: {
        iccid: {
          type: "string",
          description: "SIM card ICCID number"
        }
      },
      required: ["iccid"]
    }
  },
  {
    name: "query_sim_usage",
    description: "Query SIM card data usage for a specific month",
    inputSchema: {
      type: "object",
      properties: {
        iccid: {
          type: "string",
          description: "SIM card ICCID number"
        },
        month: {
          type: "string",
          description: "Query month in yyyyMM format (e.g., 202301)"
        }
      },
      required: ["iccid", "month"]
    }
  },
  {
    name: "query_euicc_list",
    description: "Query eUICC devices with cursor-based pagination and compact formatting",
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          description: "Pagination cursor for continuing from previous request"
        },
        pageSize: {
          type: "number",
          description: "Records per page, default 10, max 50 (reduced for token efficiency)",
          minimum: 1,
          maximum: 50
        },
        format: {
          type: "string",
          enum: ["compact", "detailed"],
          description: "Response format: 'compact' (default, saves tokens) or 'detailed'"
        },
        childEnterpriseId: {
          type: "number",
          description: "Child enterprise ID to filter"
        },
        iccid: {
          type: "string",
          description: "ICCID filter"
        },
        profileStatus: {
          type: "number",
          description: "Profile status filter (1:Not downloaded, 2:Downloading, 3:Downloaded, 4:Enabling, 5:Enabled, 6:Disabling, 7:Disabled, 8:Deleting, 9:Deleted)",
          minimum: 1,
          maximum: 9
        }
      }
    }
  },
  {
    name: "euicc_profile_stats",
    description: "Get statistical overview of eUICC profile distribution",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of records to analyze, default 100, max 200",
          minimum: 1,
          maximum: 200
        },
        format: {
          type: "string",
          enum: ["compact", "detailed"],
          description: "Response format: 'compact' (default, saves tokens) or 'detailed'"
        }
      }
    }
  },
  {
    name: "debug_config",
    description: "Show configuration and environment variables for debugging",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

// Tool implementations
const toolHandlers = {
  async query_sim_list(params) {
    try {
      let pageNum = 1;
      let cursorData = {};
      
      if (params.cursor) {
        cursorData = CMPClient.parseCursor(params.cursor);
        pageNum = cursorData.pageNum || 1;
      }
      
      const pageSize = Math.min(params.pageSize || DEFAULTS.SIM_LIST_PAGE_SIZE, 50);
      const format = params.format || DEFAULTS.FORMAT;
      
      const queryParams = { pageNum, pageSize, ...params };
      delete queryParams.cursor;
      delete queryParams.format;
      
      const response = await getCMPClient().querySimList(queryParams);
      
      if (response.code === 200) {
        const data = response.data;
        const simList = data.list || [];
        
        let nextCursor;
        if (data.current < data.pages) {
          const nextCursorData = { pageNum: data.current + 1, ...cursorData };
          nextCursor = CMPClient.createCursor(nextCursorData);
        }
        
        let result;
        if (format === "compact") {
          result = `📊 SIM List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
          if (simList.length > 0) {
            result += simList.map((sim, idx) => 
              `${idx + 1}. ${sim.iccid} | ${getStateName(sim.simState)} | ${sim.enterpriseDataPlan || 'N/A'}`
            ).join('\n');
            if (nextCursor) {
              result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
            }
          } else {
            result += "No SIM cards found";
          }
        } else {
          result = `📊 SIM Query Results\n├─ Current Page: ${data.current}\n├─ Total Pages: ${data.pages}\n├─ Total Records: ${data.total}\n\n`;
          if (simList.length > 0) {
            result += `🔍 Found ${simList.length} SIM cards:\n`;
            simList.forEach((sim, index) => {
              result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || 'N/A'}\n`;
              result += `   ├─ Status: ${getStateName(sim.simState || 0)}\n`;
              result += `   ├─ Enterprise: ${sim.enterprise || 'N/A'}\n`;
              result += `   └─ Data Plan: ${sim.enterpriseDataPlan || 'N/A'}\n`;
            });
          }
          if (nextCursor) {
            result += `\n\n🔄 Next cursor: ${nextCursor}`;
          }
        }
        
        const responseContent = { content: [{ type: "text", text: result }] };
        if (nextCursor) {
          responseContent.nextCursor = nextCursor;
        }
        return responseContent;
      } else {
        throw new Error(`Query failed: ${response.msg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('query_sim_list failed:', error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to query SIM list: ${error.message}`);
    }
  },

  async query_sim_detail({ iccid }) {
    try {
      const response = await getCMPClient().querySimDetail(iccid);
      
      if (response.code === 200) {
        const sim = response.data;
        let result = `📱 SIM Card Details\n`;
        result += `├─ SIM ID: ${sim.simId || 'N/A'}\n`;
        result += `├─ ICCID: ${sim.iccid || 'N/A'}\n`;
        result += `├─ MSISDN: ${sim.msisdn || 'N/A'}\n`;
        result += `├─ IMEI: ${sim.imei || 'N/A'}\n`;
        result += `├─ IMSI: ${sim.imsi || 'N/A'}\n`;
        result += `├─ Enterprise: ${sim.enterprise || 'N/A'}\n`;
        result += `├─ Label: ${sim.label || 'None'}\n`;
        result += `├─ Status: ${getStateName(sim.simState || 0)}\n`;
        result += `├─ State Change Reason: ${sim.simStateChangeReason || 'N/A'}\n`;
        result += `├─ Country/Region: ${sim.countryRegion || 'N/A'}\n`;
        result += `├─ Operator Network: ${sim.operatorNetwork || 'N/A'}\n`;
        result += `├─ Enterprise Data Plan: ${sim.enterpriseDataPlan || 'N/A'}\n`;
        result += `├─ Network Type: ${sim.networkType || 'N/A'}\n`;
        result += `├─ Card Type: ${sim.simType || 'N/A'}\n`;
        result += `├─ APN: ${sim.apn || 'N/A'}\n`;
        result += `├─ RAT: ${sim.rat || 'N/A'}\n`;
        result += `├─ Initial Time: ${sim.initialTime || 'N/A'}\n`;
        result += `├─ Activation Time: ${sim.activationTime || 'N/A'}\n`;
        result += `├─ Expiration Time: ${sim.expirationTime || 'N/A'}\n`;
        result += `├─ Last Session Time: ${sim.lastSessionTime || 'N/A'}\n`;
        
        const dataUsage = sim.usedDataOfCurrentPeriod || 0;
        const usage = typeof dataUsage === 'string' ? parseInt(dataUsage) || 0 : dataUsage;
        const formattedUsage = getCMPClient().formatDataUsage(usage);
        result += `└─ Current Period Data Usage: ${formattedUsage}\n`;
        
        return { content: [{ type: "text", text: result }] };
      } else {
        throw new Error(`Query failed: ${response.msg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('query_sim_detail failed:', error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to query SIM details: ${error.message}`);
    }
  },

  async query_sim_usage({ iccid, month }) {
    try {
      const response = await getCMPClient().querySimMonthData({ iccid, month });
      
      if (response.code === 200 || (response.data && typeof response.data === 'object')) {
        const usage = response.data;
        let result = `📊 SIM Usage Details\n`;
        result += `├─ ICCID: ${usage.iccid}\n`;
        result += `├─ Month: ${usage.month}\n`;
        result += `├─ Total Data Allowance: ${usage.totalDataAllowance} MB\n`;
        result += `├─ Total Data Usage: ${usage.totalDataUsage} MB\n`;
        result += `├─ Remaining Data: ${usage.remainingData} MB\n`;
        result += `├─ Outside Region Usage: ${usage.outsideRegionDataUsage} MB\n\n`;
        
        if (usage.dataUsageDetails && usage.dataUsageDetails.length > 0) {
          result += `📋 Usage Details:\n`;
          usage.dataUsageDetails.forEach((detail, index) => {
            const typeMap = { 1: "Activation Period Plan", 2: "Test Period Plan", 3: "Data Package" };
            const typeName = typeMap[detail.type] || `Type ${detail.type}`;
            
            result += `\n${index + 1}. 📦 ${detail.orderName}\n`;
            result += `   ├─ Type: ${typeName}\n`;
            result += `   ├─ Allowance: ${detail.dataAllowance} MB\n`;
            result += `   ├─ Used: ${detail.dataUsage} MB\n`;
            result += `   └─ Outside Region: ${detail.outsideRegionDataUsage} MB\n`;
          });
        } else {
          result += "❌ No detailed usage data available";
        }
        
        return { content: [{ type: "text", text: result }] };
      } else {
        throw new Error(`Query failed: ${response.msg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('query_sim_usage failed:', error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to query SIM usage: ${error.message}`);
    }
  },

  async query_euicc_list(params) {
    try {
      let pageNum = 1;
      let cursorData = {};
      
      if (params.cursor) {
        cursorData = CMPClient.parseCursor(params.cursor);
        pageNum = cursorData.pageNum || 1;
      }
      
      const pageSize = Math.min(params.pageSize || DEFAULTS.SIM_LIST_PAGE_SIZE, 50);
      const format = params.format || DEFAULTS.FORMAT;
      
      const queryParams = { pageNum, pageSize, ...params };
      delete queryParams.cursor;
      delete queryParams.format;
      
      const response = await getCMPClient().queryEuiccPage(queryParams);
      
      if (response.code === 200 || (response.data && typeof response.data === 'object')) {
        const data = response.data;
        const euiccList = data.list || [];
        
        let nextCursor;
        if (data.current < data.pages) {
          const nextCursorData = { pageNum: data.current + 1, ...cursorData };
          nextCursor = CMPClient.createCursor(nextCursorData);
        }
        
        let result;
        if (format === "compact") {
          result = `📡 eUICC List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
          if (euiccList.length > 0) {
            result += euiccList.map((euicc, idx) => 
              `${idx + 1}. ${euicc.iccid} | ${getProfileStatusName(euicc.profileStatus || 0)} | ${euicc.enterpriseName || 'N/A'}`
            ).join('\n');
            if (nextCursor) {
              result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
            }
          } else {
            result += "No eUICC devices found";
          }
        } else {
          result = `📡 eUICC List Results\n├─ Current Page: ${data.current}\n├─ Total Pages: ${data.pages}\n├─ Total Records: ${data.total}\n\n`;
          if (euiccList.length > 0) {
            result += `🔍 Found ${euiccList.length} eUICC devices:\n`;
            euiccList.forEach((euicc, index) => {
              result += `\n${index + 1}. 📱 ${euicc.iccid}\n`;
              result += `   ├─ Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
              result += `   └─ Enterprise: ${euicc.enterpriseName || 'N/A'}\n`;
            });
          }
          if (nextCursor) {
            result += `\n\n🔄 Next cursor: ${nextCursor}`;
          }
        }
        
        const responseContent = { content: [{ type: "text", text: result }] };
        if (nextCursor) {
          responseContent.nextCursor = nextCursor;
        }
        return responseContent;
      } else {
        throw new Error(`Query failed: ${response.msg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('query_euicc_list failed:', error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to query eUICC list: ${error.message}`);
    }
  },

  async euicc_profile_stats({ maxResults = DEFAULTS.STATS_MAX_RESULTS, format = DEFAULTS.FORMAT }) {
    try {
      const response = await getCMPClient().queryEuiccPage({ pageSize: Math.min(maxResults, 200) });
      
      if (response.code === 200 && response.data) {
        const euiccList = response.data.list || [];
        const statusCounts = {};
        const typeCounts = {};
        const enterpriseCounts = {};
        
        euiccList.forEach((euicc) => {
          const status = euicc.profileStatus || 0;
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          
          const type = euicc.profileType || '0';
          typeCounts[type] = (typeCounts[type] || 0) + 1;
          
          const enterprise = euicc.enterpriseName || 'Unknown';
          enterpriseCounts[enterprise] = (enterpriseCounts[enterprise] || 0) + 1;
        });
        
        let result;
        if (format === "compact") {
          result = `📊 eUICC Stats (${euiccList.length}/${response.data.total})\n`;
          const topStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
          if (topStatus) {
            const [status, count] = topStatus;
            result += `Top Status: ${getProfileStatusName(parseInt(status))} (${count})\n`;
          }
          const topEnterprise = Object.entries(enterpriseCounts).sort((a, b) => b[1] - a[1])[0];
          if (topEnterprise) {
            const [enterprise, count] = topEnterprise;
            result += `Top Enterprise: ${enterprise} (${count})`;
          }
        } else {
          result = `📊 eUICC Profile Statistics\n├─ Total Analyzed: ${euiccList.length} devices\n├─ Total in System: ${response.data.total}\n\n`;
          result += `📋 Status Distribution:\n`;
          Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([status, count]) => {
            const statusName = getProfileStatusName(parseInt(status));
            const percentage = ((count / euiccList.length) * 100).toFixed(1);
            result += `├─ ${statusName}: ${count} (${percentage}%)\n`;
          });
          result += `\n🏢 Top Enterprises:\n`;
          Object.entries(enterpriseCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([enterprise, count]) => {
            const percentage = ((count / euiccList.length) * 100).toFixed(1);
            result += `├─ ${enterprise}: ${count} (${percentage}%)\n`;
          });
        }
        
        return { content: [{ type: "text", text: result }] };
      } else {
        throw new Error(`Statistics query failed: ${response.msg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('euicc_profile_stats failed:', error.message);
      throw new McpError(ErrorCode.InternalError, `Failed to get eUICC statistics: ${error.message}`);
    }
  },

  async debug_config() {
    let result = "🔍 Configuration Debug Information\n\n";
    
    result += "📋 Current Config Values:\n";
    result += `├─ cmp_api_key: ${config.cmp_api_key ? `***FOUND(${config.cmp_api_key.length} chars)***` : 'NOT_FOUND'}\n`;
    result += `├─ cmp_api_secret: ${config.cmp_api_secret ? `***FOUND(${config.cmp_api_secret.length} chars)***` : 'NOT_FOUND'}\n`;
    result += `├─ cmp_api_endpoint: ${config.cmp_api_endpoint}\n`;
    result += "\n";

    result += "🎯 Smart Defaults (built-in, no configuration needed):\n";
    result += `├─ SIM list page size: ${DEFAULTS.SIM_LIST_PAGE_SIZE} (users can override per request)\n`;
    result += `├─ eUICC list page size: ${DEFAULTS.EUICC_LIST_PAGE_SIZE} (users can override per request)\n`;
    result += `├─ Stats max results: ${DEFAULTS.STATS_MAX_RESULTS} (users can override per request)\n`;
    result += `└─ Response format: ${DEFAULTS.FORMAT} (users can override per request)\n\n`;

    result += "🌍 Expected Environment Variables:\n";
    const expectedVars = ['CMP_API_KEY', 'CMP_API_SECRET', 'CMP_API_ENDPOINT'];
    
    expectedVars.forEach(key => {
      const value = process.env[key];
      const displayValue = (key.includes('KEY') || key.includes('SECRET')) 
        ? (value ? `***PRESENT(${value.length} chars)***` : '***NOT_SET***')
        : (value || 'NOT_SET');
      result += `├─ ${key} = ${displayValue}\n`;
    });
    
    result += `\n📊 Total Environment Variables: ${Object.keys(process.env).length}\n`;
    result += `📊 Node.js Version: ${process.version}\n`;
    result += `📊 Platform: ${process.platform}\n`;
    
    return { content: [{ type: "text", text: result }] };
  }
};

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  logger.debug(`Executing tool: ${name}`, args);
  
  if (!toolHandlers[name]) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  
  try {
    const result = await toolHandlers[name](args || {});
    logger.debug(`Tool ${name} completed successfully`);
    return result;
  } catch (error) {
    logger.error(`Tool ${name} failed:`, error.message);
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
  }
});

// Start the server
async function main() {
  logger.info("Starting CMP MCP Server");
  
  // Debug: Show relevant environment variables
  logger.info("Configuration status:");
  const configVars = ['CMP_API_KEY', 'CMP_API_SECRET', 'CMP_API_ENDPOINT', 'DEFAULT_PAGE_SIZE', 'DEFAULT_FORMAT'];
  configVars.forEach(key => {
    const value = process.env[key];
    const displayValue = (key.includes('KEY') || key.includes('SECRET')) 
      ? (value ? `***${value.length} chars***` : 'NOT_SET')
      : (value || 'NOT_SET');
    logger.info(`  ${key} = ${displayValue}`);
  });
  
  if (config.cmp_api_key && config.cmp_api_secret) {
    logger.info("✅ API credentials found");
  } else {
    logger.warn("⚠️  API credentials not found - will show error when tools are used");
  }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info("CMP MCP Server started successfully");
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});
