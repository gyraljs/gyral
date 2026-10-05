// Which package manager ran us (`npm create`, `pnpm create`, `yarn create`, `bun create`), so
// the printed next steps use its commands.

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** From `npm_config_user_agent`, e.g. `pnpm/10.33.2 npm/? node/v24.15.0 linux x64`. */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = userAgent?.split(' ')[0]?.split('/')[0];
  return name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : 'npm';
}

/** Shell commands to run a package.json script. */
const run = (pm: PackageManager, script: string): string =>
  pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;

/** The steps printed after scaffolding. `dir` is relative to where the user is. */
export function nextSteps(pm: PackageManager, dir: string, needsBrowser: boolean): string[] {
  const exec = pm === 'npm' ? 'npx' : pm === 'bun' ? 'bunx' : `${pm} exec`;
  return [
    ...(dir === '.' ? [] : [`cd ${/\s/.test(dir) ? JSON.stringify(dir) : dir}`]),
    `${pm} install`,
    ...(needsBrowser ? [`${exec} playwright install chromium   # once, for the tests`] : []),
    run(pm, 'dev'),
  ];
}
