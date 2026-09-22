const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 4173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(process.cwd(), requested === '/' ? 'index.html' : requested.slice(1));
  if (!filePath.startsWith(process.cwd())) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}).listen(port, '0.0.0.0', () => {
  console.log('Ngapaya running at http://localhost:' + port);
  console.log('LAN access: http://192.168.0.108:' + port);
});
