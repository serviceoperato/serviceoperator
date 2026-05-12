#!/usr/bin/env node
/**
 * Used by git alias: git bump [patch|minor|major]
 * Default: patch. Runs npm version, then push + push tags.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const v = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(v)) {
  console.error('usage: git bump [patch|minor|major]');
  process.exit(1);
}

execSync(`npm version ${v} -m "chore: release v%s"`, { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });
execSync('git push --tags', { stdio: 'inherit' });
