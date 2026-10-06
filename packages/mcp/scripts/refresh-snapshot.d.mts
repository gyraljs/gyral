export const SNAPSHOT_FILES: readonly string[];
export function fromArgument(argv: readonly string[]): string | undefined;
export function readLocalSnapshot(dir: string): Promise<Record<string, string>>;
export function fetchSnapshot(origin: string): Promise<Record<string, string>>;
