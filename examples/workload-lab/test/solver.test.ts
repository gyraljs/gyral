import { afterEach, describe, expect, it, vi } from 'vitest';
import { settled } from '@gyral/core';
import { makeSolver, type WorkerPort } from '../src/solver-driver.js';
import { Solver } from '../src/solver.js';
import { solve } from '../src/solver-model.js';

class Port extends EventTarget implements WorkerPort {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
  reply(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}
afterEach(() => {
  document.body.replaceChildren();
});

describe('owned worker bridge', () => {
  it('disposes success and ignores late results', async () => {
    const port = new Port();
    const controller = new AbortController();
    const result = makeSolver(() => port).run(
      { id: 1, iterations: 5 },
      { signal: controller.signal, emit: () => {} },
    );
    port.reply({ id: 999, checksum: 10 });
    port.reply(solve({ id: 1, iterations: 5 }));
    expect(await result).toEqual(solve({ id: 1, iterations: 5 }));
    port.reply({ error: 'Too late' });
    controller.abort();
    expect(port.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(['malformed', 'rejected', 'crash', 'clone'])('disposes a %s failure', async (mode) => {
    const port = new Port();
    if (mode === 'clone')
      port.postMessage.mockImplementation(() => {
        throw new Error('Cannot clone');
      });
    const pending = makeSolver(() => port).run(
      { id: 1, iterations: 5 },
      { signal: new AbortController().signal, emit: () => {} },
    );
    const failed = expect(pending).rejects.toBeInstanceOf(Error);
    if (mode === 'malformed') port.reply({ checksum: 'wrong' });
    if (mode === 'rejected') port.reply({ id: 1, error: 'Rejected job' });
    if (mode === 'crash') port.dispatchEvent(new Event('error'));
    await failed;
    expect(port.terminate).toHaveBeenCalledTimes(1);
  });

  it('aborts before reply and creates no worker for an already aborted signal', async () => {
    const controller = new AbortController();
    const port = new Port();
    const factory = vi.fn(() => port);
    const pending = makeSolver(factory).run(
      { id: 1, iterations: 5 },
      { signal: controller.signal, emit: () => {} },
    );
    const failed = expect(pending).rejects.toBeDefined();
    controller.abort();
    await failed;
    port.reply({ id: 1, checksum: 123 });
    expect(port.terminate).toHaveBeenCalledTimes(1);
    await expect(
      makeSolver(factory).run(
        { id: 2, iterations: 5 },
        { signal: controller.signal, emit: () => {} },
      ),
    ).rejects.toBeDefined();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('replaces and cancels workers with the subscription lane, including detach', async () => {
    const ports: Port[] = [];
    const driver = makeSolver(() => {
      const port = new Port();
      ports.push(port);
      return port;
    });
    const element = new Solver();
    element.drivers = { solver: driver };
    document.body.append(element);
    await settled();
    element.send({ _tag: 'Generate' });
    await settled();
    element.send({ _tag: 'Generate' });
    await settled();
    expect(ports[0]?.terminate).toHaveBeenCalledTimes(1);
    ports[0]?.reply({ id: 1, checksum: 42 });
    await settled();
    expect(element.state).toMatchObject({ job: 2, status: 'running' });
    element.send({ _tag: 'Cancel' });
    await settled();
    expect(ports[1]?.terminate).toHaveBeenCalledTimes(1);
    element.send({ _tag: 'Generate' });
    await settled();
    element.remove();
    await settled();
    expect(ports[2]?.terminate).toHaveBeenCalledTimes(1);
    document.body.append(element);
    await settled();
    expect(ports).toHaveLength(4);
    ports[3]?.reply(solve({ id: 3, iterations: 300_000 }));
    await settled();
    expect(element.state.status).toBe('done');
    expect(ports[3]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('runs the real module worker with a condition-based readiness wait', async () => {
    const element = new Solver();
    document.body.append(element);
    await settled();
    element.send({ _tag: 'Generate' });
    await vi.waitFor(
      () => {
        expect(element.state.status).toBe('done');
      },
      { timeout: 10_000 },
    );
    expect(element.state.report).toBe(
      `Worker result: ${String(solve({ id: 1, iterations: 300_000 }).checksum)}`,
    );
  }, 15_000);
});
