import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets', 'images');
const logoSrc = path.join(assetsDir, 'zena-logo.png');

// icon.png (iOS/general) - 1024x1024, logo on light blue background
await sharp(logoSrc).resize(1024, 1024, { fit: 'contain', background: '#E3F2FD' }).png().toFile(path.join(assetsDir, 'icon.png'));
console.log('Generated icon.png (1024x1024)');

// favicon.png - 196x196
await sharp(logoSrc).resize(196, 196, { fit: 'contain', background: '#E3F2FD' }).png().toFile(path.join(assetsDir, 'favicon.png'));
console.log('Generated favicon.png (196x196)');

// Android adaptive icon foreground - logo with padding for safe zone (1024x1024)
// The logo needs ~30% padding on each side so it stays inside the safe zone
const fgSize = 1024;
const logoSize = Math.round(fgSize * 0.55);
const logoBuffer = await sharp(logoSrc).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp({ create: { width: fgSize, height: fgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logoBuffer, gravity: 'centre' }])
  .png().toFile(path.join(assetsDir, 'android-icon-foreground.png'));
console.log('Generated android-icon-foreground.png (1024x1024)');

// Android adaptive icon background - light blue
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#E3F2FD' } })
  .png().toFile(path.join(assetsDir, 'android-icon-background.png'));
console.log('Generated android-icon-background.png (1024x1024)');

// Android monochrome icon - grayscale version
await sharp(logoSrc).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).grayscale().png().toFile(path.join(assetsDir, 'android-icon-monochrome.png'));
console.log('Generated android-icon-monochrome.png (1024x1024)');

// Splash icon
await sharp(logoSrc).resize(200, 200, { fit: 'contain', background: '#E3F2FD' }).png().toFile(path.join(assetsDir, 'splash-icon.png'));
console.log('Generated splash-icon.png (200x200)');

console.log('\nAll icons generated from zena-logo.png!');
