import { createServer } from "node:http";

const port = Number(process.env.PORT || 43971);
createServer((request, response) => {
  if (request.url === "/robots.txt") {
    response.end("User-agent: *\nAllow: /\n");
    return;
  }
  if (request.url === "/sitemap.xml") {
    response.setHeader("content-type", "application/xml");
    response.end(`<urlset><url><loc>http://127.0.0.1:${port}/</loc></url><url><loc>http://127.0.0.1:${port}/second</loc></url></urlset>`);
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(`<!doctype html><html lang="en"><title>Discovery fixture</title><main><h1>${request.url === "/" ? "Root" : "Second"} page</h1><a href="${request.url === "/" ? "/second" : "/"}">Other page</a></main></html>`);
}).listen(port, "127.0.0.1");
