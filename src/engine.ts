import type { IDBPDatabase } from "idb";
import type { DurableLogDB, LogEvent } from "./db.js";
import {
  isWorkflowActive,
  logsDb,
  markWorkflowAsActiveIfNotExists,
  markWorkflowAsInactive,
} from "./db.js";
import type { Workflow } from "./workflow.js";

export class DurableEngine {
  private localPendingEvents: Map<[string, LogEvent], (data: any) => void> =
    new Map();
  private workflowTimerIndexes: Map<string, number> = new Map();
  private workflows: Map<string, Workflow> = new Map();

  constructor(public db: IDBPDatabase<DurableLogDB>) {}

  addWorkflow(workflow: Workflow) {
    this.workflows.set(workflow.id, workflow);
    isWorkflowActive(workflow.id).then((isActive) => {
      if (isActive) {
        console.log(`[DurableEngine] Resuming active workflow: ${workflow.id}`);
        this.runWorkflow(workflow);
      }
    });
  }

  async runWorkflow(workflow: Workflow): Promise<void> {
    await markWorkflowAsActiveIfNotExists(workflow.id);
    await workflow.workflowFn(workflow.ctx);
    this.workflowTimerIndexes.delete(workflow.id);
    await markWorkflowAsInactive(workflow.id);
  }

  async runStep<T>({
    workflowId,
    stepName,
    stepFn,
  }: {
    workflowId: string;
    stepName: string;
    stepFn: () => Promise<T>;
  }): Promise<T> {
    const existingLog = await this.db.get("logs", [workflowId, stepName]);
    if (existingLog) {
      return existingLog.output as T;
    }

    const stepOutput = await stepFn();

    await this.db.put("logs", {
      workflowId,
      event: `step.${stepName}`,
      input: null,
      output: stepOutput,
      timestamp: Date.now(),
    });

    return stepOutput;
  }

  async signalEvent<T>(workflowId: string, eventName: string, data: T) {
    const pendingEventKey = `pending.${eventName}` as LogEvent,
      resolvedEventKey = `resolved.${eventName}` as LogEvent;

    await this.db.put("logs", {
      workflowId,
      event: resolvedEventKey,
      input: null,
      output: data,
      timestamp: Date.now(),
    });

    const callback = this.localPendingEvents.get([workflowId, pendingEventKey]);
    if (callback) {
      callback(data);
      this.localPendingEvents.delete([workflowId, pendingEventKey]);
    }
  }

  async waitForEvent<T>(workflowId: string, eventName: string): Promise<T> {
    const pendingEventKey = `pending.${eventName}` as LogEvent,
      resolvedEventKey = `resolved.${eventName}` as LogEvent;
    const existingLog = await this.db.get("logs", [
      workflowId,
      resolvedEventKey,
    ]);
    if (existingLog) {
      return existingLog.output as T;
    }

    return await this.createWaitForEvent<T>(workflowId, pendingEventKey, null);
  }

  async waitForTimer(workflowId: string, durationMs: number): Promise<void> {
    this.workflowTimerIndexes.set(
      workflowId,
      (this.workflowTimerIndexes.has(workflowId)
        ? this.workflowTimerIndexes.get(workflowId)!
        : -1) + 1,
    );
    const timerIndex = this.workflowTimerIndexes.get(workflowId)!;

    const timerEventKey = `pending.timer.${timerIndex}` as LogEvent,
      resolvedTimerEventKey = `resolved.timer.${timerIndex}` as LogEvent;

    console.log(
      `[DurableEngine] Waiting for timer: workflowId=${workflowId}, durationMs=${durationMs}, timerIndex=${timerIndex}`,
    );

    const existingLog = await this.db.get("logs", [
      workflowId,
      resolvedTimerEventKey,
    ]);
    if (existingLog) {
      return;
    }

    const timestamp = Date.now();

    let existingPendingLog = await this.db.get("logs", [
      workflowId,
      timerEventKey,
    ]);

    if (!existingPendingLog) {
      await this.db.put("logs", {
        workflowId,
        event: timerEventKey,
        input: null,
        output: null,
        timestamp,
      });
    }

    console.log(
      `[DurableEngine] Timer started: workflowId=${workflowId}, durationMs=${durationMs}, timerIndex=${timerIndex}`,
      existingPendingLog,
    );

    const elapsedTime =
      timestamp - (existingPendingLog?.timestamp ?? timestamp);
    const remainingTime = durationMs - elapsedTime;
    if (remainingTime <= 0) {
      await this.db.put("logs", {
        workflowId,
        event: resolvedTimerEventKey,
        input: null,
        output: null,
        timestamp: Date.now(),
      });
      return;
    } else {
      return await new Promise<void>((resolve) => {
        setTimeout(async () => {
          await this.db.put("logs", {
            workflowId,
            event: resolvedTimerEventKey,
            input: null,
            output: null,
            timestamp: Date.now(),
          });
          resolve();
        }, remainingTime);
      });
    }
  }

  private async addPendingEvent<T>(
    workflowId: string,
    eventKey: LogEvent,
    input: any,
    callback: (data: T) => void,
  ) {
    this.db.put("logs", {
      workflowId,
      event: eventKey,
      input,
      output: null,
      timestamp: Date.now(),
    });

    this.localPendingEvents.set([workflowId, eventKey], callback);
  }

  private async createWaitForEvent<T>(
    workflowId: string,
    eventKey: LogEvent,
    input: any,
  ): Promise<T> {
    const data = await new Promise<T>((resolve) =>
      this.addPendingEvent(workflowId, eventKey, input, (data: T) => {
        resolve(data);
      }),
    );

    return data;
  }
}

export const globalEngine = new DurableEngine(logsDb);
