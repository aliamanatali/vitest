import type { WorkerGlobalState } from '../../types/worker'
import { serializeValue } from '@vitest/utils/serialize'

// Store globals in case tests overwrite them
const processListeners = process.listeners.bind(process)
const processOn = process.on.bind(process)
const processOff = process.off.bind(process)

const dispose: (() => void)[] = []

export function reportUnhandledError(worker: WorkerGlobalState, err: unknown, type: string): void {
  const error = serializeValue(err)

  if (typeof error === 'object' && error != null) {
    error.VITEST_TEST_NAME = worker.current?.type === 'test' ? worker.current.name : undefined
    if (worker.filepath) {
      error.VITEST_TEST_PATH = worker.filepath
    }
  }
  worker.rpc.onUnhandledError(error, type)
}

export function listenForErrors(state: () => WorkerGlobalState): void {
  dispose.forEach((fn) => fn())
  dispose.length = 0

  function catchError(err: any, type: string, event: 'uncaughtException' | 'unhandledRejection') {
    const worker = state()

    const listeners = processListeners(event as 'uncaughtException')
    // if there is another listener, assume that it's handled by user code
    // one is Vitest's own listener
    if (listeners.length > 1) {
      return
    }

    reportUnhandledError(worker, err, type)
  }

  const uncaughtException = (e: Error) => catchError(e, 'Uncaught Exception', 'uncaughtException')
  const unhandledRejection = (e: Error) =>
    catchError(e, 'Unhandled Rejection', 'unhandledRejection')

  processOn('uncaughtException', uncaughtException)
  processOn('unhandledRejection', unhandledRejection)

  dispose.push(() => {
    processOff('uncaughtException', uncaughtException)
    processOff('unhandledRejection', unhandledRejection)
  })
}
