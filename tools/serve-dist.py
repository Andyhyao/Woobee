#!/usr/bin/env python3
"""Preview the deploy folder the way Vercel serves it: unknown URLs get 404.html with a 404 status.

    node build.mjs --out dist
    python3 tools/serve-dist.py            # http://localhost:4174
    python3 tools/serve-dist.py dist 8080  # another folder or port
"""
import http.server
import os
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'dist')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4174


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.webmanifest': 'application/manifest+json', '.mjs': 'text/javascript'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(ROOT, '404.html')
        if code == 404 and os.path.exists(page):
            body = open(page, 'rb').read()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)


if __name__ == '__main__':
    print(f'Serving {ROOT} at http://localhost:{PORT}')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
