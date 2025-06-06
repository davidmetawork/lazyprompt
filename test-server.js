const http = require('http');
const fs = require('fs');
const path = require('path');

// Use a high, uncommon port
const PORT = 9999;

const server = http.createServer((req, res) => {
  // Read the HTML file
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading index.html');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
==================================================
🚀 LazyPrompt Test Server Running!
==================================================

📱 View the test page at: http://localhost:${PORT}

If you can see the test page, the server is working correctly.
This confirms that your system can serve and display web content.

Press Ctrl+C to stop the server.
==================================================
`);
}); 