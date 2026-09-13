/** Queue continues after failure; reads observe all earlier writes/deletes. */
export function createSerialOperations() {
  let tail: Promise<unknown> = Promise.resolve()
  return function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation)
    tail = result.catch(() => {})
    return result
  }
}
