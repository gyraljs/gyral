import { describe, expect, it } from 'vitest';
import { defaultPrerelease, prereleaseManifest } from '../lib/pack-next.mjs';

describe('pack:next manifests', () => {
  it('pins every Gyral entry to the prerelease, dev dependencies included', () => {
    const packed = prereleaseManifest(
      {
        name: '@gyral/ssr',
        version: '0.2.0',
        dependencies: { '@gyral/core': '0.2.0' },
        peerDependencies: { '@gyral/core': '0.2.0', vite: '^8.0.0' },
        devDependencies: { '@gyral/testing': '0.2.0', hono: '4.12.0', 'create-gyral': '0.2.0' },
      },
      '0.3.0-next.3',
    );
    expect(packed).toEqual({
      name: '@gyral/ssr',
      version: '0.3.0-next.3',
      dependencies: { '@gyral/core': '0.3.0-next.3' },
      peerDependencies: { '@gyral/core': '0.3.0-next.3', vite: '^8.0.0' },
      devDependencies: {
        '@gyral/testing': '0.3.0-next.3',
        hono: '4.12.0',
        'create-gyral': '0.3.0-next.3',
      },
    });
  });

  it('adds no field the manifest lacks', () => {
    expect(prereleaseManifest({ name: '@gyral/time', version: '0.2.0' }, '0.3.0-next.3')).toEqual({
      name: '@gyral/time',
      version: '0.3.0-next.3',
    });
  });

  it('defaults to the next patch prerelease, which sorts after the release', () => {
    expect(defaultPrerelease('0.3.0')).toBe('0.3.1-next.0');
    expect(defaultPrerelease('1.9.9')).toBe('1.9.10-next.0');
    expect(defaultPrerelease('0.3.1-next.4')).toBe('0.3.2-next.0');
    expect(() => defaultPrerelease('next')).toThrow("can't derive");
  });
});
