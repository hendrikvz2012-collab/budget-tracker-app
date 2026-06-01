const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYSTORE_DIR = path.join(__dirname, '..', 'android', 'app');
const KEYSTORE_PATH = path.join(KEYSTORE_DIR, 'keystore.jks');
const GRADLE_PROPERTIES = path.join(__dirname, '..', 'android', 'gradle.properties');

const storePass = 'bt' + crypto.randomBytes(4).toString('hex');
const keyPass = 'bt' + crypto.randomBytes(4).toString('hex');
const keyAlias = 'budgettracker';

const dname = 'CN=BudgetTracker, OU=Dev, O=YourCompany, L=City, ST=State, C=US';

try {
  execSync(`keytool -genkey -v -keystore "${KEYSTORE_PATH}" -alias ${keyAlias} -keyalg RSA -keysize 2048 -validity 10000 -storepass ${storePass} -keypass ${keyPass} -dname "${dname}"`, { stdio: 'inherit' });
  console.log('\n✅ Keystore created at:', KEYSTORE_PATH);
} catch (err) {
  console.error('\n❌ keytool not found. Install Java JDK 17+ and try again.');
  console.error('   Download: https://adoptium.net/');
  process.exit(1);
}

// Append signing config to gradle.properties
const gradleEntry = `
# Android signing
android.useAndroidX=true
android.enableJetifier=true
MYAPP_RELEASE_STORE_FILE=keystore.jks
MYAPP_RELEASE_KEY_ALIAS=${keyAlias}
MYAPP_RELEASE_STORE_PASSWORD=${storePass}
MYAPP_RELEASE_KEY_PASSWORD=${keyPass}
`;

let existing = '';
if (fs.existsSync(GRADLE_PROPERTIES)) {
  existing = fs.readFileSync(GRADLE_PROPERTIES, 'utf8');
}

if (!existing.includes('MYAPP_RELEASE_STORE_FILE')) {
  fs.appendFileSync(GRADLE_PROPERTIES, gradleEntry);
  console.log('✅ gradle.properties updated with signing config');
}

console.log('\n⚠  SAVE THESE PASSWORDS SOMEWHERE SAFE:');
console.log(`   Store password: ${storePass}`);
console.log(`   Key password:   ${keyPass}`);
console.log(`   Key alias:      ${keyAlias}`);
console.log('\n   You need these to update the app on Google Play later.');
