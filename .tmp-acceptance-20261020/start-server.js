const { spawn } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: '3001',
  DATA_DIR: 'C:\\Users\\_phontakonnn\\Documents\\Wed_Phontakon\\.tmp-acceptance-20261020\\bk-data',
  EXPECTED_ORIGIN: 'http://127.0.0.1:3001',
};

const server = spawn('node', ['apps\\server\\dist\\index.js'], {
  cwd: 'C:\\Users\\_phontakonnn\\Documents\\Wed_Phontakon',
  env,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', (d) => console.log(d.toString().trim()));
server.stderr.on('data', (d) => console.error(d.toString().trim()));
server.unref();

console.log('Server PID:', server.pid);
