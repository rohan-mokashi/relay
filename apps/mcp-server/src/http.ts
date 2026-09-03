import { randomUUID } from "node:crypto";
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server as NodeServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  LIMITS,
  ProjectIdSchema,
  RELAY_TOOL_NAMES,
  type ErrorCode,
} from "../../../packages/contracts/src/index.js";
import { RelayError, asRelayError } from "../../../packages/domain/src/errors.js";
import type { RelayService } from "../../../packages/domain/src/service.js";
import {
  RELAY_READ_SCOPE,
  RELAY_WRITE_SCOPE,
  type RelayAuthenticator,
  requireScopes,
} from "./auth.js";
import { SafeLogger, principalLogId } from "./logger.js";
import { createRelayMcpServer } from "./mcp.js";
import { PrincipalRateLimiter } from "./rate-limit.js";

interface Session {
  principalRef: string;
  transport: StreamableHTTPServerTransport;
  mcpServer: Server;
}

export interface RelayHttpServerOptions {
  service: RelayService;
  authenticator: RelayAuthenticator;
  logger?: SafeLogger;
  rateLimiter?: PrincipalRateLimiter;
  requestByteLimit?: number;
}

export interface RelayHttpServer {
  nodeServer: NodeServer;
  listen(port: number, host: string): Promise<{ url: string; port: number }>;
  close(): Promise<void>;
  sessionCount(): number;
}

class PayloadTooLargeError extends Error {}

const relayToolNames = new Set<string>(RELAY_TOOL_NAMES);
const uuidRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestIdFrom = (request: IncomingMessage): string => {
  const header = request.headers["x-request-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return value && uuidRequestId.test(value) ? value : randomUUID();
};

const sessionIdFrom = (request: IncomingMessage): string | undefined => {
  const header = request.headers["mcp-session-id"];
  return Array.isArray(header) ? header[0] : header;
};

const readJsonBody = async (
  request: IncomingMessage,
  byteLimit: number,
): Promise<{ body: unknown; bytes: number }> => {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > byteLimit) {
    request.resume();
    throw new PayloadTooLargeError();
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > byteLimit) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new PayloadTooLargeError());
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ body: text.length === 0 ? undefined : JSON.parse(text), bytes });
      } catch {
        reject(new RelayError("VALIDATION_FAILED", "Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
};

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
    "cache-control": "no-store",
  });
  response.end(encoded);
};

const statusForError = (code: ErrorCode): number => {
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
      return 401;
    case "ACCESS_DENIED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "RATE_LIMITED":
      return 429;
    case "VALIDATION_FAILED":
    case "IDEMPOTENCY_CONFLICT":
    case "AMBIGUOUS_PROJECT":
      return 400;
    default:
      return 500;
  }
};

const sendHttpError = (
  response: ServerResponse,
  error: RelayError,
  requestId: string,
  challenge?: string,
): void => {
  if (response.headersSent) return;
  if (challenge && ["AUTHENTICATION_REQUIRED", "ACCESS_DENIED"].includes(error.code)) {
    response.setHeader("www-authenticate", challenge);
  }
  sendJson(response, statusForError(error.code), {
    error: {
      code: error.code,
      message: error.message,
      request_id: requestId,
      ...(error.details ? { details: error.details } : {}),
    },
  });
};

const bodyMetadata = (body: unknown): { toolName?: string; projectId?: string } => {
  if (Array.isArray(body)) {
    const entries = body.map((entry) => bodyMetadata(entry));
    return (
      entries.find((entry) =>
        ["upsert_project", "create_handoff", "create_checkpoint"].includes(entry.toolName ?? ""),
      ) ??
      entries.find((entry) => entry.toolName) ??
      {}
    );
  }
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (record.method !== "tools/call" || !record.params || typeof record.params !== "object")
    return {};
  const params = record.params as Record<string, unknown>;
  const toolName = typeof params.name === "string" ? params.name : undefined;
  const argumentsValue = params.arguments;
  const candidateProjectId =
    argumentsValue && typeof argumentsValue === "object"
      ? (argumentsValue as Record<string, unknown>).project_id
      : undefined;
  const projectId = ProjectIdSchema.safeParse(candidateProjectId);
  return {
    ...(toolName && relayToolNames.has(toolName) ? { toolName } : {}),
    ...(projectId.success ? { projectId: projectId.data } : {}),
  };
};

export const createRelayHttpServer = (options: RelayHttpServerOptions): RelayHttpServer => {
  const logger = options.logger ?? new SafeLogger();
  const limiter = options.rateLimiter ?? new PrincipalRateLimiter(120);
  const byteLimit = options.requestByteLimit ?? LIMITS.requestBytes;
  const sessions = new Map<string, Session>();
  const mutationTools = new Set(["upsert_project", "create_handoff", "create_checkpoint"]);

  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const startedAt = performance.now();
    const requestId = requestIdFrom(request);
    let principalRef: string | undefined;
    let payloadBytes = 0;
    let toolName: string | undefined;
    let projectId: string | undefined;
    let status = "ok";
    let errorCode: string | undefined;
    let requiredScopes: string[] = [RELAY_READ_SCOPE];

    try {
      const url = new URL(request.url ?? "/", "http://relay.local");
      const protectedResourceMetadata = options.authenticator.protectedResourceMetadata();
      if (
        url.pathname === "/.well-known/oauth-protected-resource" &&
        request.method === "GET" &&
        protectedResourceMetadata
      ) {
        sendJson(response, 200, protectedResourceMetadata);
        return;
      }

      const authenticated = await options.authenticator.authenticate(request.headers.authorization);
      principalRef = authenticated.principalRef;
      limiter.consume(principalRef);

      if (url.pathname !== "/mcp" && url.pathname !== "/healthz") {
        sendJson(response, 404, {
          error: { code: "NOT_FOUND", message: "Endpoint was not found.", request_id: requestId },
        });
        return;
      }

      if (url.pathname === "/healthz") {
        if (request.method !== "GET") {
          throw new RelayError("NOT_FOUND", "Endpoint was not found.");
        }
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (!request.method || !["POST", "GET", "DELETE"].includes(request.method)) {
        throw new RelayError("VALIDATION_FAILED", "MCP endpoint accepts POST, GET, and DELETE.");
      }

      let body: unknown;
      if (request.method === "POST") {
        const parsed = await readJsonBody(request, byteLimit);
        body = parsed.body;
        payloadBytes = parsed.bytes;
        ({ toolName, projectId } = bodyMetadata(body));
      }

      if (toolName && mutationTools.has(toolName)) {
        requiredScopes = [RELAY_READ_SCOPE, RELAY_WRITE_SCOPE];
      }
      requireScopes(authenticated, requiredScopes);

      const sessionId = sessionIdFrom(request);
      let session = sessionId ? sessions.get(sessionId) : undefined;

      if (sessionId && !session) {
        throw new RelayError("NOT_FOUND", "MCP session was not found.");
      }
      if (session && session.principalRef !== principalRef) {
        throw new RelayError("ACCESS_DENIED", "MCP session belongs to another principal.");
      }

      if (!session) {
        if (request.method !== "POST" || !isInitializeRequest(body)) {
          throw new RelayError(
            "VALIDATION_FAILED",
            "Initialize Relay before sending MCP requests without a session ID.",
          );
        }

        let createdSession: Session;
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedId) => {
            sessions.set(initializedId, createdSession);
          },
        });
        const mcpServer = createRelayMcpServer(
          options.service,
          principalRef,
          (event) => {
            logger.log({
              level: event.status === "ok" ? "info" : "warn",
              event: "tool.call",
              requestId: event.requestId,
              toolName: event.toolName,
              principalId: principalLogId(principalRef ?? ""),
              status: event.status,
              durationMs: event.durationMs,
              errorCode: event.errorCode,
            });
          },
          options.authenticator.securityScopes(),
        );
        createdSession = { principalRef, transport, mcpServer };
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) sessions.delete(id);
          void mcpServer.close();
        };
        transport.onerror = () => {
          logger.log({
            level: "error",
            event: "transport.error",
            requestId,
            principalId: principalLogId(principalRef ?? ""),
            status: "error",
            errorCode: "INTERNAL_ERROR",
          });
        };
        await mcpServer.connect(transport);
        session = createdSession;
      }

      await session.transport.handleRequest(request, response, body);
    } catch (caught) {
      status = "error";
      const error =
        caught instanceof PayloadTooLargeError
          ? new RelayError("PAYLOAD_TOO_LARGE", `Request exceeds ${byteLimit} bytes.`)
          : asRelayError(caught);
      errorCode = error.code;
      sendHttpError(
        response,
        error,
        requestId,
        options.authenticator.challenge(
          requiredScopes,
          error.code === "ACCESS_DENIED" ? "insufficient_scope" : "invalid_token",
        ),
      );
    } finally {
      logger.log({
        level: status === "ok" ? "info" : "warn",
        event: "http.request",
        requestId,
        toolName,
        principalId: principalRef ? principalLogId(principalRef) : undefined,
        projectId,
        status,
        durationMs: Math.round(performance.now() - startedAt),
        payloadBytes,
        errorCode,
      });
    }
  };

  const nodeServer = createNodeServer((request, response) => {
    void handler(request, response);
  });

  return {
    nodeServer,
    listen: async (port, host) => {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        nodeServer.once("error", onError);
        nodeServer.listen(port, host, () => {
          nodeServer.off("error", onError);
          resolve();
        });
      });
      const address = nodeServer.address() as AddressInfo;
      return { url: `http://${host}:${address.port}/mcp`, port: address.port };
    },
    close: async () => {
      await Promise.all(
        [...sessions.values()].map(async (session) => {
          await session.transport.close();
          await session.mcpServer.close();
        }),
      );
      sessions.clear();
      if (!nodeServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        nodeServer.close((error) => (error ? reject(error) : resolve()));
        nodeServer.closeAllConnections();
      });
    },
    sessionCount: () => sessions.size,
  };
};
