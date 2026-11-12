import type { ErrorReporter } from './errorReporter';
import type { Logger } from './logger';

export interface JobStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  runs: number;
  consecutiveFailures: number;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Tidak sukses dalam 3× interval, atau gagal berturut-turut ≥ 3. */
  stale: boolean;
}

interface JobState {
  intervalMs: number;
  running: boolean;
  runs: number;
  consecutiveFailures: number;
  lastStartedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  registeredAt: number;
}

/** Menjalankan job berkala dengan guard anti-tumpang-tindih dan mencatat kesehatannya. */
export class JobMonitor {
  private readonly jobs = new Map<string, JobState>();
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly reporter: ErrorReporter,
    private readonly now: () => number = Date.now,
  ) {}

  register(name: string, intervalMs: number): void {
    this.jobs.set(name, {
      intervalMs,
      running: false,
      runs: 0,
      consecutiveFailures: 0,
      lastStartedAt: null,
      lastSuccessAt: null,
      lastError: null,
      registeredAt: this.now(),
    });
  }

  /** Jalankan satu putaran; putaran yang tumpang-tindih dilewati. Tidak pernah melempar. */
  async run(name: string, fn: () => Promise<unknown>): Promise<boolean> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job tidak terdaftar: ${name}`);
    if (job.running) {
      this.logger.warn('job_skipped_overlap', { job: name });
      return false;
    }
    job.running = true;
    job.lastStartedAt = this.now();
    try {
      await fn();
      job.lastSuccessAt = this.now();
      job.consecutiveFailures = 0;
      job.lastError = null;
      return true;
    } catch (err) {
      job.consecutiveFailures += 1;
      job.lastError = err instanceof Error ? err.message : String(err);
      this.reporter.report(err, { source: 'job', route: name });
      return false;
    } finally {
      job.runs += 1;
      job.running = false;
    }
  }

  /** Jadwalkan job dengan setInterval (timer di-unref agar tidak menahan proses). */
  schedule(name: string, intervalMs: number, fn: () => Promise<unknown>): void {
    this.register(name, intervalMs);
    const timer = setInterval(() => void this.run(name, fn), intervalMs);
    timer.unref();
    this.timers.push(timer);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers.length = 0;
  }

  status(): JobStatus[] {
    const t = this.now();
    return [...this.jobs].map(([name, j]) => {
      const reference = j.lastSuccessAt ?? j.registeredAt;
      return {
        name,
        intervalMs: j.intervalMs,
        running: j.running,
        runs: j.runs,
        consecutiveFailures: j.consecutiveFailures,
        lastStartedAt: j.lastStartedAt ? new Date(j.lastStartedAt).toISOString() : null,
        lastSuccessAt: j.lastSuccessAt ? new Date(j.lastSuccessAt).toISOString() : null,
        lastError: j.lastError,
        stale: j.consecutiveFailures >= 3 || t - reference > 3 * j.intervalMs,
      };
    });
  }
}
