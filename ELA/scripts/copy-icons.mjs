/**
 * ELA PWA Icon Copy Script
 * Copies the approved logo JPG to all required icon locations.
 * Run with: node scripts/copy-icons.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const srcLogoPath = path.resolve(
  'C:\\Users\\ELFATH\\.gemini\\antigravity-ide\\brain\\176a18d4-051d-4089-a138-6d11f0e92ebb\\ela_logo_option_3_1786881500324.jpg'
);

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const iconsDir = path.join(publicDir, 'icons');

// Ensure directories exist
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

if (!fs.existsSync(srcLogoPath)) {
  console.error('❌ Source logo not found at:', srcLogoPath);
  process.exit(1);
}

const copies = [
  { dest: path.join(iconsDir, 'icon-512x512.jpg'),        label: '512x512 main icon' },
  { dest: path.join(iconsDir, 'icon-192x192.jpg'),        label: '192x192 main icon' },
  { dest: path.join(iconsDir, 'icon-maskable-512x512.jpg'), label: '512x512 maskable icon' },
  { dest: path.join(iconsDir, 'apple-touch-icon.jpg'),    label: 'Apple touch icon (180x180)' },
  { dest: path.join(iconsDir, 'icon.jpg'),                label: 'Master icon' },
  { dest: path.join(publicDir, 'favicon.jpg'),            label: 'Favicon' },
  { dest: path.join(publicDir, 'logo.jpg'),               label: 'Logo for app usage' },
];

copies.forEach(({ dest, label }) => {
  fs.copyFileSync(srcLogoPath, dest);
  console.log(`✅ ${label} → ${path.relative(projectRoot, dest)}`);
});

console.log('\n🎉 All ELA icons copied successfully!');
