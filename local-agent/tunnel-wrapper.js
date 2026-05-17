// Wrapper to run cloudflared.exe as a child process without flashing CMD windows
const { spawn } = require('child_process');
const path = require('path');

const cloudflared = path.join(__dirname, 'cloudflared.exe');
const child = spawn(cloudflared, ['tunnel', 'run', 'ytubviral-dashboard'], {
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
