import type { Ctx } from '../src/index.js';

/** Context for calling a reducer directly in a test that reads no stores. */
export const ctxOf = <P>(props: P): Ctx<P> => ({
  props,
  read: () => {
    throw new Error('this test reads no stores');
  },
});
