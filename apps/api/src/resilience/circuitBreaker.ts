export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number; // Failures before opening circuit
  resetTimeoutMs?: number;   // Time to wait before entering HALF_OPEN
  successThreshold?: number; // Successes in HALF_OPEN before closing
  timeoutMs?: number;        // Max execution time per call
}

export class CircuitBreakerOpenError extends Error {
  public readonly serviceName: string;
  public readonly resetTime: Date;

  constructor(serviceName: string, resetTime: Date) {
    super(`Circuit breaker for '${serviceName}' is OPEN. Requests are temporarily failed-fast.`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.resetTime = resetTime;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly timeoutMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;
    this.successThreshold = options.successThreshold || 2;
    this.timeoutMs = options.timeoutMs || 8000;
  }

  public getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  public getStats() {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime > 0 ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }

  private evaluateState(): void {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      }
    }
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.evaluateState();

    if (this.state === 'OPEN') {
      const resetTime = new Date(this.lastFailureTime + this.resetTimeoutMs);
      throw new CircuitBreakerOpenError(this.name, resetTime);
    }

    try {
      const result = await this.executeWithTimeout(fn, this.timeoutMs);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Service call to '${this.name}' timed out after ${ms}ms.`));
        }
      }, ms);

      fn()
        .then((res) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(res);
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
}

/**
 * Executes a function with exponential backoff and randomized jitter to prevent thundering herd.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 200;
  const maxDelay = options.maxDelayMs ?? 5000;
  const factor = options.backoffFactor ?? 2;
  const useJitter = options.jitter ?? true;

  let attempt = 0;
  let delay = initialDelay;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }

      // Calculate exponential backoff with optional jitter
      const jitterFactor = useJitter ? 0.75 + Math.random() * 0.5 : 1.0;
      const waitMs = Math.min(delay * jitterFactor, maxDelay);

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  throw new Error('Unreachable retry state');
}
