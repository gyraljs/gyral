// Pure parts of `pnpm demos:record` (scripts/demos-record.mjs): argument parsing, demo module
// validation and output names. Tested in scripts/test/demos.test.mjs.
//
// A demo is `examples/<name>/demo.mjs`, a scripted Playwright path through the example that
// shows one idea for the "What you can build" page on gyral.dev. Its default export:
//
//   export default {
//     pitch: 'One line: what the viewer sees and why it is easy in Gyral.',
//     usual: 'One line: how this is usually done (the contrast).',
//     scenes: [
//       // Each scene is one recording. `javaScript: false` records the no-JS experience.
//       { id: 'main', path: '/', javaScript: true, run: async (page, { pause, poster }) => {} },
//     ],
//   };
//
// `pause(ms)` holds the frame so viewers can follow; `poster()` captures the poster image at
// that moment (default: the last frame). Demos must be deterministic: no network, no clocks
// the example doesn't control, fixed typing speed.

/** The recording size: the video and the poster are both 1280×720. */
export const FRAME = { width: 1280, height: 720 };

export const OUT_DIR = '.demos';

const USAGE = `Usage: pnpm demos:record [example…] [--port=5600] [--scheme=light|dark]
  example   examples with a demo.mjs to record (default: all of them)
  --port    index port for the example servers (default 5600, or EXAMPLES_PORT)
  --scheme  colour scheme to record in (default light)
Writes .demos/<example>[-<scene>].webm and .png.`;

export function parseArgs(argv, env = {}) {
  const options = { examples: [], port: Number(env['EXAMPLES_PORT'] ?? 5600), scheme: 'light' };
  const errors = [];
  for (const arg of argv) {
    const [flag, value] = arg.split('=', 2);
    if (!arg.startsWith('--')) options.examples.push(arg);
    else if (flag === '--help') errors.push('help');
    else if (flag === '--port') {
      const n = Number(value);
      if (value === undefined || !Number.isInteger(n) || n <= 0)
        errors.push(`${arg}: expects a port number`);
      else options.port = n;
    } else if (flag === '--scheme') {
      if (value === 'light' || value === 'dark') options.scheme = value;
      else errors.push(`${arg}: expects light or dark`);
    } else errors.push(`unknown option ${arg}`);
  }
  return { options, errors, usage: USAGE };
}

const SCENE_ID = /^[a-z][a-z0-9-]*$/;

/** Problems with a demo module's default export, or [] when it is valid. */
export function validateDemo(name, demo) {
  const at = `${name}/demo.mjs`;
  if (typeof demo !== 'object' || demo === null) return [`${at}: default export must be an object`];
  const problems = [];
  for (const key of ['pitch', 'usual']) {
    if (typeof demo[key] !== 'string' || demo[key].trim() === '')
      problems.push(`${at}: '${key}' must be a non-empty string`);
  }
  if (!Array.isArray(demo.scenes) || demo.scenes.length === 0) {
    problems.push(`${at}: 'scenes' must be a non-empty array`);
    return problems;
  }
  const ids = new Set();
  demo.scenes.forEach((scene, n) => {
    const where = `${at} scene ${String(n + 1)}`;
    if (typeof scene !== 'object' || scene === null) {
      problems.push(`${where}: must be an object`);
      return;
    }
    if (typeof scene.id !== 'string' || !SCENE_ID.test(scene.id))
      problems.push(`${where}: 'id' must be lower-case words joined by dashes`);
    else if (ids.has(scene.id)) problems.push(`${where}: duplicate id '${scene.id}'`);
    else ids.add(scene.id);
    if (typeof scene.run !== 'function') problems.push(`${where}: 'run' must be a function`);
    if (scene.path !== undefined && (typeof scene.path !== 'string' || !scene.path.startsWith('/')))
      problems.push(`${where}: 'path' must start with /`);
    if (scene.javaScript !== undefined && typeof scene.javaScript !== 'boolean')
      problems.push(`${where}: 'javaScript' must be a boolean`);
  });
  return problems;
}

/** File stem for a scene: the example name alone when it has one scene. */
export const sceneStem = (name, sceneId, sceneCount) =>
  sceneCount === 1 ? name : `${name}-${sceneId}`;
