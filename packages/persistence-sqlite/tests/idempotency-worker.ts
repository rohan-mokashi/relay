import { parentPort, workerData } from "node:worker_threads";
import { RelayService } from "../../domain/src/service.js";
import { projectInput } from "../../test-support/src/fixtures.js";
import { SqliteRelayRepository } from "../src/sqlite-repository.js";

interface WorkerInput {
  databasePath: string;
  requestId: string;
}

const input = workerData as WorkerInput;
const repository = new SqliteRelayRepository(input.databasePath);
const service = new RelayService(repository);

const port = parentPort;
if (!port) throw new Error("Idempotency worker requires a parent port.");
port.postMessage({ kind: "ready" });
port.once("message", () => {
  try {
    const result = service.upsertProject(
      { principalRef: "principal-a", requestId: input.requestId },
      projectInput(),
    );
    port.postMessage({ kind: "result", result });
  } catch (caught) {
    port.postMessage({
      kind: "error",
      message: caught instanceof Error ? caught.message : "unknown worker error",
    });
  } finally {
    repository.close();
  }
});
