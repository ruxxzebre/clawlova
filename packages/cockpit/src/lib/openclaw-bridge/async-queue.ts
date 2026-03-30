export class AsyncQueue<T> {
  private items: Array<T> = []
  private resolvers: Array<(item: IteratorResult<T>) => void> = []
  private closed = false

  push(item: T): void {
    if (this.closed) return
    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()
      resolver?.({ value: undefined, done: true })
    }
  }

  async *iterate(abortSignal?: AbortSignal): AsyncGenerator<T> {
    while (!this.closed || this.items.length > 0) {
      if (abortSignal?.aborted) {
        return
      }

      if (this.items.length > 0) {
        yield this.items.shift() as T
        continue
      }

      const next = await new Promise<IteratorResult<T>>((resolve) => {
        const onAbort = () => {
          abortSignal?.removeEventListener('abort', onAbort)
          resolve({ value: undefined, done: true })
        }

        this.resolvers.push((result) => {
          abortSignal?.removeEventListener('abort', onAbort)
          resolve(result)
        })
        abortSignal?.addEventListener('abort', onAbort, { once: true })
      })

      if (next.done) {
        return
      }

      yield next.value
    }
  }
}
