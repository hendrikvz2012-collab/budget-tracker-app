const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const ICON_SVG = path.join(ASSETS, 'icon.svg');
const PLATFORMS = path.join(__dirname, '..');

// iOS icon sizes (from Apple HIG)
const IOS_ICONS = [
  40, 60, 58, 87, 80, 120, 180, 20, 29, 76, 152, 167, 1024
];

// Android icon sizes
const ANDROID_ICONS = [
  { size: 48, folder: 'mipmap-mdpi' },
  { size: 72, folder: 'mipmap-hdpi' },
  { size: 96, folder: 'mipmap-xhdpi' },
  { size: 144, folder: 'mipmap-xxhdpi' },
  { size: 192, folder: 'mipmap-xxxhdpi' },
  { size: 512, folder: 'playstore-icon' },
];

async function generate() {
  const svg = fs.readFileSync(ICON_SVG);

  // iOS
  const iosDir = path.join(PLATFORMS, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  // Make sure directory exists (Capacitor creates it)
  if (fs.existsSync(iosDir)) {
    for (const size of IOS_ICONS) {
      const filename = `icon-${size}.png`;
      await sharp(svg).resize(size, size).png().toFile(path.join(iosDir, filename));
      console.log(`  iOS ${size}x${size}`);
    }
    // Also update Contents.json if needed
    console.log('✅ iOS icons generated');
  }

  // Android
  const androidRes = path.join(PLATFORMS, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidRes)) {
    for (const { size, folder } of ANDROID_ICONS) {
      const dir = path.join(androidRes, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await sharp(svg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
      console.log(`  Android ${folder} ${size}x${size}`);
    }
    console.log('✅ Android icons generated');
  }

  console.log('\n✅ All icons generated!');
}

generate().catch(err => { console.error(err); process.exit(1); });
