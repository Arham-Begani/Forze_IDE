import { describe, expect, it } from 'vitest';
import { isLocalhostUrl, toLoadableLocalUrl } from './openLink';

describe('isLocalhostUrl', () => {
  it('matches localhost over http and https', () => {
    expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
    expect(isLocalhostUrl('https://localhost:3000')).toBe(true);
    expect(isLocalhostUrl('http://localhost:5173/some/path?q=1')).toBe(true);
  });

  it('matches the loopback and bind-all hosts', () => {
    expect(isLocalhostUrl('http://127.0.0.1:5173')).toBe(true);
    expect(isLocalhostUrl('http://0.0.0.0:8080')).toBe(true);
    expect(isLocalhostUrl('http://[::1]:3000')).toBe(true);
    expect(isLocalhostUrl('https://app.localhost:3000')).toBe(true);
  });

  it('rejects remote hosts and non-web schemes', () => {
    expect(isLocalhostUrl('https://example.com')).toBe(false);
    expect(isLocalhostUrl('https://forze.in/app')).toBe(false);
    expect(isLocalhostUrl('http://notlocalhost.com')).toBe(false);
    expect(isLocalhostUrl('file:///etc/hosts')).toBe(false);
    expect(isLocalhostUrl('ftp://localhost')).toBe(false);
    expect(isLocalhostUrl('not a url')).toBe(false);
  });
});

describe('toLoadableLocalUrl', () => {
  it('rewrites bind-all addresses to localhost, preserving scheme/port/path', () => {
    expect(toLoadableLocalUrl('http://0.0.0.0:3000')).toBe('http://localhost:3000/');
    expect(toLoadableLocalUrl('https://0.0.0.0:5173/app')).toBe(
      'https://localhost:5173/app',
    );
    expect(toLoadableLocalUrl('http://[::]:8080')).toBe('http://localhost:8080/');
  });

  it('leaves already-loadable URLs untouched', () => {
    expect(toLoadableLocalUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(toLoadableLocalUrl('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
  });
});
