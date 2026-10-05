// npm package names for the generated app, derived from the target directory.

/** Why `name` is not a valid npm package name, or undefined when it is. */
export function invalidPackageName(name: string): string | undefined {
  if (name.length === 0) return 'the name is empty';
  if (name.length > 214) return 'the name is longer than 214 characters';
  if (name !== name.toLowerCase()) return 'the name must be lowercase';
  if (/^[._]/.test(name)) return 'the name cannot start with "." or "_"';
  if (name.trim() !== name) return 'the name cannot start or end with spaces';
  if (!/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    return 'use only lowercase letters, digits, "-", "." and "_"';
  }
  if (['node_modules', 'favicon.ico'].includes(name)) return `"${name}" is reserved`;
  return undefined;
}

/** A valid package name from a directory name: `My App!` → `my-app`. */
export function toPackageName(dir: string): string {
  const base =
    dir
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .at(-1) ?? '';
  const name = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-._~]+/g, '-')
    .replace(/^[-._]+|-+$/g, '');
  return name === '' ? 'gyral-app' : name;
}
