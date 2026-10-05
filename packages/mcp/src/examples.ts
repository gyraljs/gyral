// The examples gallery: what each example shows, and its component source.
import type { Example } from './types.js';

export function listExamples(examples: readonly Example[]): string {
  return examples.map((e) => `- **${e.name}**: ${e.title}. ${e.description} (${e.url})`).join('\n');
}

export function findExample(examples: readonly Example[], name: string): Example | undefined {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/^examples\//, '');
  return (
    examples.find((e) => e.name === key) ??
    examples.find((e) => e.title.toLowerCase() === key) ??
    examples.find((e) => e.name.includes(key))
  );
}

/** The example's component files in full (capped), other files by name. */
export function formatExample(example: Example, max = 24_000): string {
  const files = example.components
    .map((f) => `\`${f.path}\`:\n\n\`\`\`ts\n${f.source.trimEnd()}\n\`\`\``)
    .join('\n\n');
  const others =
    example.otherFiles.length === 0
      ? ''
      : `\n\nOther files: ${example.otherFiles.map((f) => `\`${f}\``).join(', ')} (see the source link).`;
  const text = `# ${example.title}\n\n${example.description}\n\nSource: ${example.url}\n\n${files}${others}`;
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n\n[Truncated; read the rest at ${example.url}]`;
}
