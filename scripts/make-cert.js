/**
 * Generate a self-signed code-signing certificate for AIClocker using
 * PowerShell's New-SelfSignedCertificate (built into Windows, no OpenSSL needed).
 *
 * Output:
 *   certs/aiclocker.pfx   - PKCS#12 bundle with private key (for signing)
 *   certs/aiclocker.cer   - Public certificate (for users to import)
 *   certs/password.txt    - PFX password (gitignored)
 *   certs/README.md       - Instructions for trusting the cert
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

const certDir = path.join(__dirname, '..', 'certs');
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const pfxPath = path.join(certDir, 'aiclocker.pfx');
const cerPath = path.join(certDir, 'aiclocker.cer');
const passwordPath = path.join(certDir, 'password.txt');
const readmePath = path.join(certDir, 'README.md');

if (fs.existsSync(pfxPath)) {
  console.log('Certificate already exists at certs/aiclocker.pfx');
  console.log('Delete it first if you want to regenerate.');
  process.exit(0);
}

// Generate random password (no special chars that could break PS parsing)
const password = crypto.randomBytes(24).toString('hex');

console.log('Generating self-signed code-signing certificate via PowerShell...');

const psScript = `
$ErrorActionPreference = 'Stop'

$cert = New-SelfSignedCertificate \`
  -Type CodeSigningCert \`
  -Subject 'CN=AIClocker, O=Ben Kirtland, C=AU' \`
  -KeyUsage DigitalSignature \`
  -FriendlyName 'AIClocker Code Signing' \`
  -CertStoreLocation 'Cert:\\CurrentUser\\My' \`
  -NotAfter (Get-Date).AddYears(5) \`
  -HashAlgorithm SHA256 \`
  -KeyExportPolicy Exportable \`
  -KeySpec Signature \`
  -KeyLength 2048 \`
  -KeyAlgorithm RSA

$pwd = ConvertTo-SecureString -String '${password}' -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath '${pfxPath.replace(/\\/g, '\\\\')}' -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath '${cerPath.replace(/\\/g, '\\\\')}' -Type CERT | Out-Null

Remove-Item -Path ('Cert:\\CurrentUser\\My\\' + $cert.Thumbprint) -Force

Write-Output ('Thumbprint: ' + $cert.Thumbprint)
`;

// Write script to temp file to avoid command-line escaping issues
const tempScript = path.join(os.tmpdir(), `aiclocker-cert-${Date.now()}.ps1`);
fs.writeFileSync(tempScript, psScript);

try {
  const output = execSync(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  console.log(output.trim());
} catch (e) {
  console.error('Failed to generate certificate:');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
} finally {
  try { fs.unlinkSync(tempScript); } catch (e) {}
}

fs.writeFileSync(passwordPath, password, { mode: 0o600 });

const readme = `# AIClocker Self-Signed Certificate

This directory contains a self-signed code-signing certificate used to sign
AIClocker installers. The files here are **secret** and must never be
committed to version control.

## Files

- \`aiclocker.pfx\` — private key bundle (PKCS#12), used by electron-builder to sign
- \`aiclocker.cer\` — public certificate, distributable to users who want to trust the signature
- \`password.txt\` — the PFX password (plain text)
- \`README.md\` — this file

## Why self-signed?

Real code-signing certificates cost $200-500/year from commercial CAs.
For personal/internal distribution, a self-signed cert is fine — it still
produces a valid Authenticode signature, it just isn't trusted by Windows
by default, so Windows SmartScreen will show an "Unknown publisher" warning
on first run unless the public cert is imported.

## How users can trust the cert (optional)

To eliminate SmartScreen warnings:

1. Double-click \`aiclocker.cer\`
2. Click "Install Certificate..."
3. Choose "Local Machine" (requires admin) or "Current User"
4. Select "Place all certificates in the following store"
5. Browse → "Trusted Root Certification Authorities"
6. Next → Finish

## Rotation

The cert is valid for 5 years. To regenerate, delete this directory and run
\`node scripts/make-cert.js\` again.
`;

fs.writeFileSync(readmePath, readme);

console.log('');
console.log('Generated files:');
console.log(`  ${pfxPath}`);
console.log(`  ${cerPath}`);
console.log(`  ${passwordPath}`);
console.log(`  ${readmePath}`);
