import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Durable logs store step input/output and include the following:
 * - Workflow ID
 * - Log event (step, pending, resolved) + event name
 * - Output
 * - Timestamp
 *
 * During execution, logs are stored in IndexedDB.
 *
 * When a workflow is resumed, logs are retrieved from IndexedDB and
 * can be used to replay the workflow execution.
 */

type EventType = "step" | "pending" | "resolved";
export type LogEvent = `${EventType}.${string}`;

export interface DurableLog {
  workflowId: string;
  event: LogEvent;
  input: any;
  output: any;
  timestamp: number;
}

export interface DurableLogDB extends DBSchema {
  logs: {
    key: [string, string]; // [workflowId, event]
    value: DurableLog;
    indexes: {
      "by-workflow": [string]; // [workflowId]
    };
  };
}

export const logsDb = await openDB<DurableLogDB>("durable-logs", 1, {
  upgrade(db) {
    const store = db.createObjectStore("logs", {
      keyPath: ["workflowId", "event"],
    });
    store.createIndex("by-workflow", ["workflowId"]);
  },
});

export interface ActiveWorkflow {
  workflowId: string;
  active: 1;
}

export interface ActiveWorkflowsDb extends DBSchema {
  workflows: {
    key: string;
    value: ActiveWorkflow;
    indexes: {
      "by-workflow": string;
    };
  };
}
export const activeWorkflowsDb = await openDB<ActiveWorkflowsDb>(
  "active-workflows",
  1,
  {
    upgrade(db) {
      const store = db.createObjectStore("workflows", {
        keyPath: "workflowId",
      });
      store.createIndex("by-workflow", "workflowId");
    },
  },
);

export async function markWorkflowAsActiveIfNotExists(
  workflowId: string,
): Promise<boolean> {
  const activeWorkflow = await activeWorkflowsDb.get("workflows", workflowId);
  if (activeWorkflow) {
    return false;
  }
  await activeWorkflowsDb.put("workflows", { workflowId, active: 1 });
  return true;
}

export async function markWorkflowAsInactive(
  workflowId: string,
): Promise<void> {
  await activeWorkflowsDb.delete("workflows", workflowId);
}

export async function isWorkflowActive(workflowId: string): Promise<boolean> {
  const activeWorkflow = await activeWorkflowsDb.get("workflows", workflowId);
  return !!activeWorkflow;
}

export async function clearAllDatabases(): Promise<void> {
  await logsDb.clear("logs");
  await activeWorkflowsDb.clear("workflows");
}
