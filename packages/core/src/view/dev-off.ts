// Production build of the view layer's flag (`#view-dev` without the `development` condition):
// a literal `false`, so bundlers drop every `if (DEV)` check and warning. See dev.ts.
export const DEV: boolean = false;
