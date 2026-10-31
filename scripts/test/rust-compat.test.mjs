import { describe, expect, it } from 'vitest';
import { acceptance, checkFixture, parseVersion, readFixture } from '../lib/rust-compat.mjs';

const fixture = await readFixture();
// The same fixture once it pins a gyral-rs release that accepts the protocol (0.8.0 and later).
const protocolRelease = {
  ...fixture,
  gyralRs: { ...fixture.gyralRs, version: '0.8.0', acceptsGyral: undefined },
};

describe('the Rust compatibility fixture (ADR 0034)', () => {
  it('is schema 2: the protocol plus a pinned gyral-rs release, no npm pin', () => {
    expect(checkFixture(fixture)).toBe(fixture);
    expect(fixture).not.toHaveProperty('npm');
    expect(fixture.minGyral).toBe('0.3.8');
  });

  it('rejects a fixture without archive digests', () => {
    const broken = { ...fixture, gyralRs: { ...fixture.gyralRs, archives: {} } };
    expect(() => checkFixture(broken)).toThrow(/source archive name/);
  });
});

describe('acceptance', () => {
  it('accepts any release on the protocol from its minimum, minors included', () => {
    for (const version of ['0.3.8', '0.3.10', '0.4.0', '1.0.0']) {
      expect(acceptance(protocolRelease, version), version).toBeUndefined();
    }
  });

  it('refuses releases below the minimum and prereleases (decision 7)', () => {
    expect(acceptance(protocolRelease, '0.3.7')).toMatch(/below protocol 1's minimum, 0\.3\.8/);
    expect(acceptance(protocolRelease, '0.3.10-next.1')).toMatch(/no prerelease/);
  });

  it('holds a gyral-rs release from before the protocol to its one release', () => {
    const exact = { ...fixture, gyralRs: { ...fixture.gyralRs, acceptsGyral: '0.3.9' } };
    expect(acceptance(exact, '0.3.9')).toBeUndefined();
    expect(acceptance(exact, '0.3.10')).toMatch(
      /predates the SSR protocol .* accepts only Gyral 0\.3\.9; this candidate is 0\.3\.10\. Pin a gyral-rs release that accepts protocol 1 \(0\.8\.0 or later\)/,
    );
  });
});

describe('parseVersion', () => {
  it('reads strict MAJOR.MINOR.PATCH only', () => {
    expect(parseVersion('0.3.10')).toEqual([0, 3, 10]);
    for (const version of ['0.3', '01.2.3', '0.3.10-next.1', '0.3.10+build', 'v0.3.10', '']) {
      expect(parseVersion(version), version).toBeUndefined();
    }
  });
});
