'use strict';
/**
 * Genera el secreto TOTP para el 2FA del admin (A6, 2026-07-05). Uso único, local.
 *
 *   node scripts/admin-totp-setup.js
 *
 * 1. Genera un secreto nuevo y muestra un QR en la terminal.
 * 2. Escanéalo con Google Authenticator / 1Password / Authy.
 * 3. Sube el secreto impreso como ADMIN_TOTP_SECRET en Vercel (env var, no en BD).
 * 4. Introduce el código de 6 dígitos que te pida tu app para confirmar que el reloj cuadra
 *    antes de dar la spec por cerrada.
 *
 * Recuperación si pierdes el dispositivo: borra ADMIN_TOTP_SECRET de Vercel (el login
 * admin vuelve a pedir solo contraseña) y repite este script para re-enrolar.
 */
const { authenticator } = require('otplib');
const qrcode = require('qrcode-terminal');
const readline = require('readline');

const email = process.argv[2] || 'admin@ytubviral.com';
const secret = authenticator.generateSecret();
const otpauth = authenticator.keyuri(email, 'YTubViral Admin', secret);

console.log('\n=== YTubViral — Setup 2FA admin ===\n');
console.log(`Secreto (guárdalo también como backup): ${secret}\n`);
console.log('Escanea este QR con tu app de autenticación:\n');

qrcode.generate(otpauth, { small: true }, (qr) => {
  console.log(qr);
  console.log(`\n1. Sube este valor a Vercel como ADMIN_TOTP_SECRET:\n   ${secret}\n`);
  console.log('2. Redeploy.');
  console.log('3. Verifica aquí mismo el primer código antes de darlo por bueno:\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Código de 6 dígitos de tu app: ', (code) => {
    const valid = authenticator.verify({ token: code.trim(), secret });
    console.log(valid ? '\n✅ Código válido — el reloj cuadra, listo para producción.' : '\n❌ Código inválido — revisa la hora del sistema o vuelve a escanear el QR.');
    rl.close();
    process.exit(valid ? 0 : 1);
  });
});
