import fs from 'fs';
import path from 'path';

const file = path.join(path.resolve(import.meta.dirname, '..'), 'public', 'admin.js');
let c = fs.readFileSync(file, 'utf8');
const nl = c.includes('\r\n') ? '\r\n' : '\n';
let n = c.replace(/\r\n/g, '\n');

const pairs = [
  ["headers: { Authorization: 'Bearer ' + getAdminBearer() }", 'headers: adminAuthHeaders()'],
  ["headers: { Authorization: 'Bearer ' + token }", 'headers: adminAuthHeaders()'],
  ["headers: { Authorization: 'Bearer ' + tok }", 'headers: adminAuthHeaders()'],
  ["headers: { Authorization: 'Bearer ' + jwt }", 'headers: adminAuthHeaders()'],
  [
    `headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          }`,
    'headers: adminAuthHeadersJson()',
  ],
  [
    `headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            }`,
    'headers: adminAuthHeadersJson()',
  ],
  [
    `headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          }`,
    'headers: adminAuthHeadersJson()',
  ],
  ["headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }", 'headers: adminAuthHeadersJson()'],
  [
    `headers: {
          Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json',
        }`,
    'headers: adminAuthHeadersJson()',
  ],
  [
    `headers: {
          Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json',
        }`,
    'headers: adminAuthHeadersJson()',
  ],
  [
    `return {
      Authorization: 'Bearer ' + getAdminBearer(),
    };`,
    'return adminAuthHeaders();',
  ],
];

for (const [from, to] of pairs) {
  while (n.includes(from)) n = n.replace(from, to);
}

if (nl === '\r\n') n = n.replace(/\n/g, '\r\n');
fs.writeFileSync(file, n);
console.log('bearer header replacements done');
