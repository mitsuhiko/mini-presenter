import http from "node:http";

export function startServer({ rootDir, port }) {
  const server = http.createServer((req, res) => {
    res.statusCode = 501;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("mini-presenter server not implemented yet.\n");
  });

  server.listen(port, () => {
    console.log(`mini-presenter serving ${rootDir} on http://localhost:${port}`);
  });

  return server;
}
