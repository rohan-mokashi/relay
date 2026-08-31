import { createHash } from "node:crypto";
import { ProjectIdSchema, RELAY_TOOL_NAMES } from "../../../packages/contracts/src/index.js";

export interface SafeLogEvent {
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  toolName?: string;
  principalId?: string;
  projectId?: string;
  status?: string;
  durationMs?: number;
  payloadBytes?: number;
  errorCode?: string;
}

type LogSink = (line: string) => void;

const relayToolNames = new Set<string>(RELAY_TOOL_NAMES);
const uuidRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const principalLogId = (principalRef: string): string =>
  `usr_${createHash("sha256").update(principalRef).digest("hex").slice(0, 16)}`;

export class SafeLogger {
  constructor(
    private readonly sink: LogSink = (line) => process.stderr.write(`${line}\n`),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  log(event: SafeLogEvent): void {
    const toolName =
      event.toolName && relayToolNames.has(event.toolName) ? event.toolName : undefined;
    const projectId = ProjectIdSchema.safeParse(event.projectId);
    const requestId =
      event.requestId && uuidRequestId.test(event.requestId) ? event.requestId : undefined;
    const record = {
      timestamp: this.clock(),
      level: event.level,
      event: event.event,
      ...(requestId ? { request_id: requestId } : {}),
      ...(toolName ? { tool_name: toolName } : {}),
      ...(event.principalId ? { principal_id: event.principalId } : {}),
      ...(projectId.success ? { project_id: projectId.data } : {}),
      ...(event.status ? { status: event.status } : {}),
      ...(event.durationMs === undefined ? {} : { duration_ms: event.durationMs }),
      ...(event.payloadBytes === undefined ? {} : { payload_bytes: event.payloadBytes }),
      ...(event.errorCode ? { error_code: event.errorCode } : {}),
    };
    this.sink(JSON.stringify(record));
  }
}
