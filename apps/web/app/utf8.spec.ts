import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('Vietnamese UI encoding', () => {
  it('keeps UI source in valid UTF-8 without common mojibake markers', () => {
    const files = sourceFiles(__dirname);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, file).not.toContain('\uFFFD');
      expect(content, file).not.toMatch(
        /(?:\u00c3[\u0080-\u00bf]|\u00c4[\u0080-\u00bf\u2018\u2019]|\u00c6[\u00a0-\u00bf]|\u00e1(?:\u00ba|\u00bb)|\u00e2\u20ac|\u00c2(?:\u00a0|\u00b7))/u,
      );
    }
  });

  it('declares Vietnamese document language and Vietnamese navigation', () => {
    expect(readFileSync(join(__dirname, 'layout.tsx'), 'utf8')).toContain('<html lang="vi">');
    expect(readFileSync(join(__dirname, 'page.tsx'), 'utf8')).toContain('Tổng quan');
  });
});
