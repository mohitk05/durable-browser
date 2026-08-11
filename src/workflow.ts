import { globalEngine, type DurableEngine } from "./engine.js";
import parse from "parse-duration";

export class WorkflowContext {
  constructor(
    private engine: DurableEngine,
    private workflowId: string,
  ) {}

  /**
   * Pauses the workflow execution until an event with the specified name is received.
   * @param eventName The name of the event to wait for.
   * @returns A promise that resolves with the event data when the event is received.
   */
  async onEvent<T>(eventName: string): Promise<T> {
    return this.engine.waitForEvent<T>(this.workflowId, eventName);
  }

  /**
   * Executes a step in the workflow, allowing for better tracking and error handling.
   * @param stepFn The function representing the step to execute.
   * @returns A promise that resolves with the result of the step function.
   */
  async step<T>(stepFn: () => Promise<T>): Promise<T> {
    return this.engine.runStep({
      workflowId: this.workflowId,
      stepName: stepFn.name,
      stepFn,
    });
  }

  /**
   * Pauses the workflow execution for a specified duration.
   * @param duration The duration to sleep, specified as a string (e.g., "1h", "30m", "10s").
   * @returns A promise that resolves after the specified duration has elapsed.
   */
  async sleep(duration: string): Promise<void> {
    const ms = parse(duration);
    if (ms === null) {
      // resolve immediately if the duration is invalid or zero
      console.warn(
        `Invalid duration "${duration}" provided to sleep. Resolving immediately.`,
      );
      return;
    }

    await this.engine.waitForTimer(this.workflowId, ms);
  }
}

export class Workflow {
  id: string;
  ctx: WorkflowContext;

  constructor(
    private engine: DurableEngine,
    public name: string,
    public workflowFn: (ctx: WorkflowContext) => Promise<void>,
  ) {
    this.id = name;
    this.ctx = new WorkflowContext(engine, this.id);
  }

  async run(): Promise<void> {
    await this.engine.runWorkflow(this);
  }
}

export function createWorkflow(
  name: string,
  workflowFn: (ctx: WorkflowContext) => Promise<void>,
): Workflow {
  const workflow = new Workflow(globalEngine, name, workflowFn);
  globalEngine.addWorkflow(workflow);
  return workflow;
}
