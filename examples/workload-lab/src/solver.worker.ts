import { isJob, solve } from './solver-model.js';
// A structural worker scope avoids adding WebWorker globals to the app's DOM lib.
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (value: unknown) => void;
};
worker.onmessage = ({ data }) => {
  if (!isJob(data)) {
    worker.postMessage({ error: 'Malformed job' });
    return;
  }
  try {
    worker.postMessage(solve(data));
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
