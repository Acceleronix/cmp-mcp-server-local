import { config as loadEnv } from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ErrorCode,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
	CMPClient,
	DataUsageDetail,
	EuiccPageDto,
	getProfileStatusName,
	getProfileTypeName,
	getStateName,
} from "./cmp_client.js";

loadEnv();

type ToolResponse = {
	content: Array<{ type: "text"; text: string }>;
	nextCursor?: string;
};

type SimListFormat = "compact" | "detailed";

type QuerySimListArgs = {
	cursor?: string;
	pageSize?: number;
	format?: SimListFormat;
	enterpriseDataPlan?: string;
	expirationTimeStart?: string;
	expirationTimeEnd?: string;
	iccidStart?: string;
	iccidEnd?: string;
	label?: string;
	simState?: number;
	simType?: string;
};

type QueryEuiccArgs = {
	cursor?: string;
	pageSize?: number;
	format?: SimListFormat;
	childEnterpriseId?: number;
	iccid?: string;
	profileStatus?: number;
};

type QuerySimUsageArgs = {
	iccid: string;
	month: string;
};

type ToolHandlers = {
	query_sim_list: (params: QuerySimListArgs) => Promise<ToolResponse>;
	query_sim_detail: (params: { iccid: string }) => Promise<ToolResponse>;
	query_sim_usage: (params: QuerySimUsageArgs) => Promise<ToolResponse>;
	query_euicc_list: (params: QueryEuiccArgs) => Promise<ToolResponse>;
	euicc_profile_stats: (params: { maxResults?: number; format?: SimListFormat }) => Promise<ToolResponse>;
	debug_config: () => Promise<ToolResponse>;
};

const config = {
	apiKey: process.env.CMP_API_KEY,
	apiSecret: process.env.CMP_API_SECRET,
	apiEndpoint: process.env.CMP_API_ENDPOINT || "https://cmp.acceleronix.io/gateway/openapi",
	defaultPageSize: Math.min(parseInt(process.env.DEFAULT_PAGE_SIZE ?? "10", 10) || 10, 50),
	defaultFormat: (process.env.DEFAULT_FORMAT as SimListFormat) || "compact",
};

const enableDebugLogging = process.env.ENABLE_DEBUG_LOGGING === "true";

const logger = {
	debug: (...args: unknown[]) => {
		if (enableDebugLogging) {
			console.error("[DEBUG]", new Date().toISOString(), ...args);
		}
	},
	info: (...args: unknown[]) => console.error("[INFO]", new Date().toISOString(), ...args),
	warn: (...args: unknown[]) => console.error("[WARN]", new Date().toISOString(), ...args),
	error: (...args: unknown[]) => console.error("[ERROR]", new Date().toISOString(), ...args),
};

let cmpClient: CMPClient | null = null;

function getCMPClient(): CMPClient {
	if (!config.apiKey || !config.apiSecret) {
		throw new McpError(
			ErrorCode.InvalidRequest,
			"CMP API credentials not configured. Set CMP_API_KEY and CMP_API_SECRET in your environment."
		);
	}

	if (!cmpClient) {
		cmpClient = new CMPClient(config.apiKey, config.apiSecret, config.apiEndpoint);
		cmpClient.setLogger(logger);
		logger.info("CMP client initialized successfully");
	}

	return cmpClient;
}

const server = new Server(
	{
		name: "cmp-mcp-server",
		version: "2.0.0",
	},
	{
		capabilities: {
			tools: {},
		},
	}
);

const tools = [
	{
		name: "query_sim_list",
		description: "Query SIM cards with cursor-based pagination and optional compact formatting",
		inputSchema: {
			type: "object",
			properties: {
				cursor: { type: "string", description: "Pagination cursor from a previous response" },
				pageSize: {
					type: "number",
					description: "Records per page (default 10, max 50)",
					minimum: 1,
					maximum: 50,
				},
				format: {
					type: "string",
					enum: ["compact", "detailed"],
					description: "Response format",
				},
				enterpriseDataPlan: { type: "string" },
				expirationTimeStart: { type: "string" },
				expirationTimeEnd: { type: "string" },
				iccidStart: { type: "string" },
				iccidEnd: { type: "string" },
				label: { type: "string" },
				simState: { type: "number" },
				simType: { type: "string" },
			},
		},
	},
	{
		name: "query_sim_detail",
		description: "Retrieve rich metadata for a SIM card via ICCID",
		inputSchema: {
			type: "object",
			properties: {
				iccid: { type: "string", description: "SIM card ICCID" },
			},
			required: ["iccid"],
		},
	},
	{
		name: "query_sim_usage",
		description: "Fetch SIM usage for a billing month",
		inputSchema: {
			type: "object",
			properties: {
				iccid: { type: "string" },
				month: { type: "string", description: "yyyyMM (e.g., 202401)" },
			},
			required: ["iccid", "month"],
		},
	},
	{
		name: "query_euicc_list",
		description: "List eUICC profiles with pagination",
		inputSchema: {
			type: "object",
			properties: {
				cursor: { type: "string" },
				pageSize: {
					type: "number",
					description: "Records per page (default 10, max 50)",
					minimum: 1,
					maximum: 50,
				},
				format: { type: "string", enum: ["compact", "detailed"] },
				childEnterpriseId: { type: "number" },
				iccid: { type: "string" },
				profileStatus: { type: "number", minimum: 1, maximum: 9 },
			},
		},
	},
	{
		name: "euicc_profile_stats",
		description: "Summarize top eUICC statuses and enterprises",
		inputSchema: {
			type: "object",
			properties: {
				maxResults: { type: "number", minimum: 1, maximum: 200 },
				format: { type: "string", enum: ["compact", "detailed"] },
			},
		},
	},
	{
		name: "debug_config",
		description: "Show environment and config useful for troubleshooting",
		inputSchema: { type: "object", properties: {} },
	},
];

const toolHandlers: ToolHandlers = {
	async query_sim_list(params) {
		try {
			let pageNum = 1;
			let cursorData: Record<string, unknown> = {};

			if (params.cursor) {
				cursorData = CMPClient.parseCursor(params.cursor);
				pageNum = (cursorData.pageNum as number) || 1;
			}

			const pageSize = Math.min(params.pageSize || config.defaultPageSize, 50);
			const format = params.format || config.defaultFormat;

			const queryParams = { pageNum, pageSize, ...params };
			delete (queryParams as QuerySimListArgs).cursor;
			delete (queryParams as QuerySimListArgs).format;

			const response = await getCMPClient().querySimList(queryParams);

			if (response.code !== 200) {
				throw new Error(response.msg || "Unknown error");
			}

			const data = response.data;
			const simList = data.list || [];

			let nextCursor: string | undefined;
			if (data.current < data.pages) {
				const nextCursorData = { pageNum: data.current + 1, ...cursorData };
				nextCursor = CMPClient.createCursor(nextCursorData);
			}

			let result = "";
			if (format === "compact") {
				result = `📊 SIM List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
				if (simList.length > 0) {
					result += simList
						.map((sim: any, idx: number) => `${idx + 1}. ${sim.iccid} | ${getStateName(sim.simState)} | ${sim.enterpriseDataPlan || "N/A"}`)
						.join("\n");
					if (nextCursor) {
						result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
					}
				} else {
					result += "No SIM cards found";
				}
			} else {
				result = `📊 SIM Query Results\n├─ Current Page: ${data.current}\n├─ Total Pages: ${data.pages}\n├─ Total Records: ${data.total}\n\n`;
				if (simList.length > 0) {
					result += "🔍 Found SIM cards:\n";
					simList.forEach((sim: any, index: number) => {
						result += `\n${index + 1}. 📱 ICCID: ${sim.iccid || "N/A"}\n`;
						result += `   ├─ Status: ${getStateName(sim.simState || 0)}\n`;
						result += `   ├─ Enterprise: ${sim.enterprise || "N/A"}\n`;
						result += `   └─ Data Plan: ${sim.enterpriseDataPlan || "N/A"}\n`;
					});
				}
				if (nextCursor) {
					result += `\n\n🔄 Next cursor: ${nextCursor}`;
				}
			}

			const responseContent: ToolResponse = {
				content: [{ type: "text", text: result }],
			};

			if (nextCursor) {
				responseContent.nextCursor = nextCursor;
			}

			return responseContent;
		} catch (error) {
			logger.error("query_sim_list failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new McpError(ErrorCode.InternalError, `Failed to query SIM list: ${message}`);
		}
	},

	async query_sim_detail({ iccid }) {
		try {
			const response = await getCMPClient().querySimDetail(iccid);
			if (response.code !== 200) {
				throw new Error(response.msg || "Unknown error");
			}

			const sim = response.data;
			let result = "📱 SIM Card Details\n";
			result += `├─ SIM ID: ${sim.simId || "N/A"}\n`;
			result += `├─ ICCID: ${sim.iccid || "N/A"}\n`;
			result += `├─ MSISDN: ${sim.msisdn || "N/A"}\n`;
			result += `├─ IMEI: ${sim.imei || "N/A"}\n`;
			result += `├─ IMSI: ${sim.imsi || "N/A"}\n`;
			result += `├─ Enterprise: ${sim.enterprise || "N/A"}\n`;
			result += `├─ Label: ${sim.label || "None"}\n`;
			result += `├─ Status: ${getStateName(sim.simState || 0)}\n`;
			result += `├─ State Change Reason: ${sim.simStateChangeReason || "N/A"}\n`;
			result += `├─ Country/Region: ${sim.countryRegion || "N/A"}\n`;
			result += `├─ Operator Network: ${sim.operatorNetwork || "N/A"}\n`;
			result += `├─ Enterprise Data Plan: ${sim.enterpriseDataPlan || "N/A"}\n`;
			result += `├─ Network Type: ${sim.networkType || "N/A"}\n`;
			result += `├─ Card Type: ${sim.simType || "N/A"}\n`;
			result += `├─ APN: ${sim.apn || "N/A"}\n`;
			result += `├─ RAT: ${sim.rat || "N/A"}\n`;
			result += `├─ Initial Time: ${sim.initialTime || "N/A"}\n`;
			result += `├─ Activation Time: ${sim.activationTime || "N/A"}\n`;
			result += `├─ Expiration Time: ${sim.expirationTime || "N/A"}\n`;
			result += `├─ Last Session Time: ${sim.lastSessionTime || "N/A"}\n`;

			const dataUsage = sim.usedDataOfCurrentPeriod || 0;
			const usageValue = typeof dataUsage === "string" ? parseInt(dataUsage, 10) || 0 : dataUsage;
			const formattedUsage = getCMPClient().formatDataUsage(usageValue);
			result += `└─ Current Period Data Usage: ${formattedUsage}\n`;

			return { content: [{ type: "text", text: result }] };
		} catch (error) {
			logger.error("query_sim_detail failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new McpError(ErrorCode.InternalError, `Failed to query SIM details: ${message}`);
		}
	},

	async query_sim_usage({ iccid, month }) {
		try {
			const response = await getCMPClient().querySimMonthData({ iccid, month });
			if (response.code !== 200 && typeof response.data !== "object") {
				throw new Error(response.msg || "Unknown error");
			}

			const usage = response.data as Record<string, any>;
			let result = "📊 SIM Usage Details\n";
			result += `├─ ICCID: ${usage.iccid}\n`;
			result += `├─ Month: ${usage.month}\n`;
			result += `├─ Total Data Allowance: ${usage.totalDataAllowance} MB\n`;
			result += `├─ Total Data Usage: ${usage.totalDataUsage} MB\n`;
			result += `├─ Remaining Data: ${usage.remainingData} MB\n`;
			result += `├─ Outside Region Usage: ${usage.outsideRegionDataUsage} MB\n\n`;

			const details = usage.dataUsageDetails as DataUsageDetail[] | undefined;
			if (details?.length) {
				result += "📋 Usage Details:\n";
				details.forEach((detail, index) => {
					const typeMap: Record<number, string> = {
						1: "Activation Period Plan",
						2: "Test Period Plan",
						3: "Data Package",
					};
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
		} catch (error) {
			logger.error("query_sim_usage failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new McpError(ErrorCode.InternalError, `Failed to query SIM usage: ${message}`);
		}
	},

	async query_euicc_list(params) {
		try {
			let pageNum = 1;
			let cursorData: Record<string, unknown> = {};

			if (params.cursor) {
				cursorData = CMPClient.parseCursor(params.cursor);
				pageNum = (cursorData.pageNum as number) || 1;
			}

			const pageSize = Math.min(params.pageSize || config.defaultPageSize, 50);
			const format = params.format || config.defaultFormat;

			const queryParams = { pageNum, pageSize, ...params };
			delete (queryParams as QueryEuiccArgs).cursor;
			delete (queryParams as QueryEuiccArgs).format;

			const response = await getCMPClient().queryEuiccPage(queryParams);
			if (response.code !== 200 && typeof response.data !== "object") {
				throw new Error(response.msg || "Unknown error");
			}

			const data = response.data;
			const euiccList: EuiccPageDto[] = data.list || [];

			let nextCursor: string | undefined;
			if (data.current < data.pages) {
				const nextCursorData = { pageNum: data.current + 1, ...cursorData };
				nextCursor = CMPClient.createCursor(nextCursorData);
			}

			let result = "";
			if (format === "compact") {
				result = `📡 eUICC List (Page ${data.current}/${data.pages}, Total: ${data.total})\n`;
				if (euiccList.length > 0) {
					result += euiccList
						.map((euicc, idx) => `${idx + 1}. ${euicc.iccid} | ${getProfileStatusName(euicc.profileStatus || 0)} | ${euicc.enterpriseName || "N/A"}`)
						.join("\n");
					if (nextCursor) {
						result += `\n\n🔄 More data available. Use cursor: ${nextCursor.slice(0, 20)}...`;
					}
				} else {
					result += "No eUICC devices found";
				}
			} else {
				result = `📡 eUICC List Results\n├─ Current Page: ${data.current}\n├─ Total Pages: ${data.pages}\n├─ Total Records: ${data.total}\n\n`;
				if (euiccList.length > 0) {
					result += "🔍 Found eUICC devices:\n";
					euiccList.forEach((euicc, index) => {
						result += `\n${index + 1}. 📱 ${euicc.iccid}\n`;
						result += `   ├─ Status: ${getProfileStatusName(euicc.profileStatus || 0)}\n`;
						result += `   └─ Enterprise: ${euicc.enterpriseName || "N/A"}\n`;
					});
				}
				if (nextCursor) {
					result += `\n\n🔄 Next cursor: ${nextCursor}`;
				}
			}

			const responseContent: ToolResponse = {
				content: [{ type: "text", text: result }],
			};
			if (nextCursor) {
				responseContent.nextCursor = nextCursor;
			}
			return responseContent;
		} catch (error) {
			logger.error("query_euicc_list failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new McpError(ErrorCode.InternalError, `Failed to query eUICC list: ${message}`);
		}
	},

	async euicc_profile_stats({ maxResults = 100, format = config.defaultFormat }) {
		try {
			const response = await getCMPClient().queryEuiccPage({ pageSize: Math.min(maxResults, 200) });
			if (response.code !== 200 || !response.data) {
				throw new Error(response.msg || "Unknown error");
			}

			const euiccList: EuiccPageDto[] = response.data.list || [];
			const statusCounts: Record<number, number> = {};
			const enterpriseCounts: Record<string, number> = {};
			const typeCounts: Record<string, number> = {};

			euiccList.forEach((euicc) => {
				const status = euicc.profileStatus || 0;
				statusCounts[status] = (statusCounts[status] || 0) + 1;

				const enterprise = euicc.enterpriseName || "Unknown";
				enterpriseCounts[enterprise] = (enterpriseCounts[enterprise] || 0) + 1;

				const type = euicc.profileType || "0";
				typeCounts[type] = (typeCounts[type] || 0) + 1;
			});

			let result = "";
			if (format === "compact") {
				result = `📊 eUICC Stats (${euiccList.length}/${response.data.total})\n`;
				const topStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0];
				if (topStatus) {
					const [status, count] = topStatus;
					result += `Top Status: ${getProfileStatusName(Number(status))} (${count})\n`;
				}
				const topEnterprise = Object.entries(enterpriseCounts).sort((a, b) => b[1] - a[1])[0];
				if (topEnterprise) {
					const [enterprise, count] = topEnterprise;
					result += `Top Enterprise: ${enterprise} (${count})`;
				}
			} else {
				result = `📊 eUICC Profile Statistics\n├─ Total Analyzed: ${euiccList.length} devices\n├─ Total in System: ${response.data.total}\n\n`;
				result += "📋 Status Distribution:\n";
				Object.entries(statusCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 3)
					.forEach(([status, count]) => {
						const percentage = euiccList.length ? ((count / euiccList.length) * 100).toFixed(1) : "0";
						result += `├─ ${getProfileStatusName(Number(status))}: ${count} (${percentage}%)\n`;
					});
				result += "\n🏢 Top Enterprises:\n";
				Object.entries(enterpriseCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 3)
					.forEach(([enterprise, count]) => {
						const percentage = euiccList.length ? ((count / euiccList.length) * 100).toFixed(1) : "0";
						result += `├─ ${enterprise}: ${count} (${percentage}%)\n`;
					});
			}

			return { content: [{ type: "text", text: result }] };
		} catch (error) {
			logger.error("euicc_profile_stats failed", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new McpError(ErrorCode.InternalError, `Failed to get eUICC statistics: ${message}`);
		}
	},

	async debug_config() {
		let result = "🔍 Configuration Debug Information\n\n";
		result += "📋 Current Config Values:\n";
		result += `├─ CMP_API_KEY: ${config.apiKey ? `***FOUND(${config.apiKey.length} chars)***` : "NOT_SET"}\n`;
		result += `├─ CMP_API_SECRET: ${config.apiSecret ? `***FOUND(${config.apiSecret.length} chars)***` : "NOT_SET"}\n`;
		result += `├─ CMP_API_ENDPOINT: ${config.apiEndpoint}\n`;
		result += `├─ DEFAULT_PAGE_SIZE: ${config.defaultPageSize}\n`;
		result += `├─ DEFAULT_FORMAT: ${config.defaultFormat}\n`;
		result += "\n";

		result += "🌍 Environment Snapshot:\n";
		const envKeys = ["CMP_API_KEY", "CMP_API_SECRET", "CMP_API_ENDPOINT", "DEFAULT_PAGE_SIZE", "DEFAULT_FORMAT"];
		envKeys.forEach((key) => {
			const value = process.env[key];
			const display = key.includes("KEY") || key.includes("SECRET")
				? value
					? `***PRESENT(${value.length} chars)***`
					: "NOT_SET"
				: value || "NOT_SET";
			result += `├─ ${key}: ${display}\n`;
		});

		result += `\n📊 Node.js Version: ${process.version}\n`;
		result += `📊 Platform: ${process.platform}\n`;

		return { content: [{ type: "text", text: result }] };
	},
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;
	const handler = (toolHandlers as Record<string, (p: any) => Promise<ToolResponse>>)[name];

	if (!handler) {
		throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
	}

	logger.debug(`Executing tool: ${name}`, args);
	return handler((args as Record<string, unknown>) || {});
});

async function main() {
	logger.info("Starting CMP MCP Server (local mode)");
	const envSummary = [
		"CMP_API_KEY",
		"CMP_API_SECRET",
		"CMP_API_ENDPOINT",
		"DEFAULT_PAGE_SIZE",
		"DEFAULT_FORMAT",
	];
	envSummary.forEach((key) => {
		const value = process.env[key];
		const masked = key.includes("KEY") || key.includes("SECRET") ? (value ? `***${value.length} chars***` : "NOT_SET") : value || "NOT_SET";
		logger.info(`  ${key}: ${masked}`);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.info("CMP MCP Server ready on stdio");
}

process.on("SIGINT", () => {
	logger.info("Received SIGINT, shutting down...");
	process.exit(0);
});

process.on("SIGTERM", () => {
	logger.info("Received SIGTERM, shutting down...");
	process.exit(0);
});

process.on("uncaughtException", (error) => {
	logger.error("Uncaught exception", error);
	process.exit(1);
});

process.on("unhandledRejection", (reason) => {
	logger.error("Unhandled rejection", reason);
	process.exit(1);
});

main().catch((error) => {
	logger.error("Failed to start server", error);
	process.exit(1);
});
