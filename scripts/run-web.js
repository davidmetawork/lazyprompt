const { spawn } = require('child_process');
const path = require('path');

console.log('=== LazyPrompt Web App Runner ===');

const webAppPath = path.join(__dirname, '../apps/web');

// Run the Next.js development server with port configuration
const nextDev = spawn('npx', ['next', 'dev', '-p', '3001'], {
  cwd: webAppPath,
  stdio: 'inherit',
  shell: true
});

nextDev.on('error', (error) => {
  console.error('Failed to start Next.js development server:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  nextDev.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  nextDev.kill('SIGTERM');
  process.exit(0);
}); 