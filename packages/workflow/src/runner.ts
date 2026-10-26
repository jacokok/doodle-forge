import { randomUUID } from 'node:crypto';
import { WorkflowRepository } from '@doodleforge/database';
import { executeStage, type Stage, type StageContext } from './index.js';

type Work = NonNullable<ReturnType<WorkflowRepository['claim']>>;
export interface StageHandler {
  readonly key: string;
  readonly version: string;
  execute(
    repository: WorkflowRepository,
    work: Work,
    signal: AbortSignal,
    leaseMs: number,
  ): Promise<boolean>;
}
export function stageHandler<I, O>(
  stage: Stage<I, O>,
  log?: StageContext['log'],
): StageHandler {
  return {
    key: stage.key,
    version: stage.version,
    execute: (repository, work, signal, leaseMs) =>
      executeStage(repository, work, stage, signal, log, leaseMs),
  };
}
/** Only explicitly known, safe-to-repeat transient work may use this classification. */
export class RetryableStageError extends Error {}
export interface RunnerOptions {
  workerId?: string;
  concurrency?: number;
  pollMs?: number;
  heartbeatMs?: number;
  leaseMs?: number;
  shutdownGraceMs?: number;
  onFault?: () => void;
}
interface ActiveWork {
  work: Work;
  controller: AbortController;
  heartbeat: ReturnType<typeof setInterval>;
  task: Promise<void>;
}
export class WorkflowRunner {
  private readonly workerId: string;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly leaseMs: number;
  private readonly shutdownGraceMs: number;
  private readonly handlers: Map<string, StageHandler>;
  private readonly active = new Map<string, ActiveWork>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private started = false;
  private stopping = false;
  private closing: Promise<void> | undefined;

  constructor(
    private readonly repository: WorkflowRepository,
    handlers: readonly StageHandler[],
    private readonly options: RunnerOptions = {},
  ) {
    this.workerId = options.workerId ?? randomUUID();
    this.concurrency = options.concurrency ?? 1;
    this.pollMs = options.pollMs ?? 1000;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.shutdownGraceMs = options.shutdownGraceMs ?? 5000;
    for (const [value, max] of [
      [this.concurrency, 4],
      [this.pollMs, 60_000],
      [this.heartbeatMs, 60_000],
      [this.leaseMs, 300_000],
      [this.shutdownGraceMs, 60_000],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > max)
        throw new Error('Invalid runner bounds');
    }
    if (
      this.heartbeatMs >= this.leaseMs ||
      !this.workerId.trim() ||
      this.workerId.length > 120
    )
      throw new Error('Invalid runner lease');
    this.handlers = new Map(
      handlers.map((handler) => [
        this.key(handler.key, handler.version),
        handler,
      ]),
    );
    if (!handlers.length || this.handlers.size !== handlers.length)
      throw new Error('Invalid stage registry');
  }
  private key(key: string, version: string) {
    return JSON.stringify([key, version]);
  }
  start() {
    if (this.started || this.stopping)
      throw new Error('Runner already started or closed');
    this.started = true;
    this.timer = setInterval(() => this.poll(), this.pollMs);
    this.poll();
  }
  private fault() {
    if (this.stopping) return;
    // Stop claiming immediately. Runtime owns draining and closing the database.
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    for (const active of this.active.values()) {
      clearInterval(active.heartbeat);
      active.controller.abort();
    }
    this.options.onFault?.();
  }
  private poll() {
    if (this.stopping) return;
    try {
      this.repository.recoverExpired();
      for (const active of this.active.values()) {
        if (!this.repository.isCurrent(active.work.claim))
          active.controller.abort();
      }
      while (!this.stopping && this.active.size < this.concurrency) {
        const work = this.repository.claim(
          this.workerId,
          this.leaseMs,
          [...this.handlers.values()].map(({ key, version }) => ({
            key,
            version,
          })),
        );
        if (!work) break;
        this.launch(work);
      }
    } catch {
      this.fault();
    }
  }
  private launch(work: Work) {
    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      if (this.stopping || controller.signal.aborted) return;
      try {
        if (!this.repository.heartbeat(work.claim, this.leaseMs))
          controller.abort();
      } catch {
        this.fault();
      }
    }, this.heartbeatMs);
    const active: ActiveWork = {
      work,
      controller,
      heartbeat,
      task: Promise.resolve(),
    };
    this.active.set(work.claim.attemptId, active);
    // Defer invocation until the entry is installed, including synchronously throwing handlers.
    active.task = Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return;
        const handler = this.handlers.get(
          this.key(work.step.stageKey, work.step.stageVersion),
        )!;
        try {
          await handler.execute(
            this.repository,
            work,
            controller.signal,
            this.leaseMs,
          );
        } catch (error) {
          if (this.stopping || controller.signal.aborted) return;
          try {
            const retryable = error instanceof RetryableStageError;
            this.repository.fail(
              work.claim,
              JSON.stringify({
                code: retryable
                  ? 'TRANSIENT_STAGE_FAILURE'
                  : 'STAGE_EXECUTION_FAILED',
              }),
              retryable,
            );
          } catch {
            this.fault();
          }
        }
      })
      .finally(() => {
        clearInterval(heartbeat);
        this.active.delete(work.claim.attemptId);
      });
  }
  close() {
    return (this.closing ??= this.drain());
  }
  private async drain() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    let releaseFailed = false;
    const tasks = [];
    for (const active of this.active.values()) {
      clearInterval(active.heartbeat);
      active.controller.abort();
      try {
        this.repository.relinquish(active.work.claim);
      } catch {
        releaseFailed = true;
      }
      tasks.push(active.task);
    }
    // Invalidate claims before waiting: even an abort-ignoring handler cannot adopt a late result.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, this.shutdownGraceMs);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (releaseFailed)
      throw new Error('Workflow shutdown could not relinquish all claims');
  }
}
