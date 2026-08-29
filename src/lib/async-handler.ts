type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>

interface AsyncHandlerResponseOptions<TArgs extends unknown[]> {
  retries?: number
  onError?: (error: unknown, context: { args: TArgs }) => void
  rethrowInDev?: boolean
  logger?: (message: string, meta?: Record<string, unknown>) => void
}
/**
 * An async function wrapper with built-in error handling, retry logic, and structured responses.
 *
 * This utility ensures your async function returns a predictable `{ data, error }`.
 * Useful in API handlers, React Query, and service layers.
 *
 * @template TArgs - The argument tuple type of the original async function.
 * @template TResult - The resolved return type of the original async function.
 *
 * @param fn - The async function to wrap. Must return a `Promise<TResult>`.
 * @param options - Optional configuration:
 * - `retries` (default: 0): number of times to retry the function if it throws
 * - `onError`: custom callback for handling/logging errors
 * - `rethrowInDev` (default: false): rethrows the error in non-production environments
 * - `logger`: a custom logger function to replace `console.error`
 *
 * @returns A new async function that returns `{ data?: TResult; error?: unknown }`.
 *
 * @example
 * ```ts
 * async function fetchUser(id: number): Promise<User> {
 *   const res = await fetch(`/api/user/${id}`);
 *   if (!res.ok) throw new Error("Failed to fetch user");
 *   return res.json();
 * }
 *
 * const asyncHandler = handleAsync(fetchUser, { retries: 1 });
 *
 * const { data, error } = await asyncHandler(1);
 * ```
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/functions.html#function-types Function Types - TS Docs}
 */
export function handleAsync<TArgs extends unknown[], TResult>(
  fn: AsyncFn<TArgs, TResult>,
  options: AsyncHandlerResponseOptions<TArgs> = {}
): (...args: TArgs) => Promise<{ data?: TResult; error?: unknown }> {
  const { retries = 0, onError, rethrowInDev = false, logger = (msg, meta) => console.error(msg, meta) } = options

  return async (...args: TArgs): Promise<{ data?: TResult; error?: unknown }> => {
    let attempt = 0

    while (attempt <= retries) {
      try {
        const data = await fn(...args)
        return { data }
      } catch (error: unknown) {
        attempt++

        const context = { args }

        // Logging
        logger(`Error in ${fn.name || 'anonymous function'} [Attempt ${attempt}/${retries}]`, {
          error: formatError(error),
          args
        })

        // Custom handler
        if (onError) {
          try {
            onError(error, context)
          } catch (e) {
            logger('Error in custom onError handler', {
              error: formatError(e)
            })
          }
        }

        const isLastAttempt = attempt > retries

        if (isLastAttempt) {
          if (rethrowInDev && process.env.NODE_ENV !== 'production') {
            throw error
          }

          return { error: formatError(error) }
        }
      }
    }

    return { error: 'Unknown failure' } // Should never reach here
  }
}

function formatError(error: unknown) {
  if (typeof error === 'string') return { message: error }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }
  return { message: 'Unknown error', raw: error }
}
