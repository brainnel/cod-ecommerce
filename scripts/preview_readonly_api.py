"""Loopback-only design preview: public GET data, no upstream writes, no real orders.

Run this alongside npm run preview:local. Live product reads are cached in memory.
Only event names and non-personal funnel IDs are retained for local QA.
"""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import requests

CACHE = {}
EVENTS = []
LOCK = threading.Lock()
READ_PATHS = ('/api/flash-local/', '/api/vite/app/download-links')


class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/__qa/events':
            with LOCK:
                return self.respond(200, {'events': list(EVENTS), 'upstream_writes': 0})
        if not path.startswith(READ_PATHS) or any(x in path for x in ['/orders', '/order/', '/user', '/cart']):
            return self.respond(403, {'detail': 'This endpoint is not part of the read-only preview.'})
        try:
            with LOCK:
                cached = CACHE.get(self.path)
            if cached and time.monotonic() - cached[0] < 300:
                return self.respond(cached[1], cached[2])
            response = requests.get('https://api.brainnel.com/backend' + self.path,
                                    proxies={'https': 'http://127.0.0.1:7890'}, timeout=30,
                                    allow_redirects=False)
            data = response.json()
            with LOCK:
                CACHE[self.path] = (time.monotonic(), response.status_code, data)
            self.respond(response.status_code, data)
        except Exception:
            self.respond(502, {'detail': 'Preview could not read live product data. Retry shortly.'})

    def do_POST(self):
        size = min(int(self.headers.get('Content-Length', '0')), 100_000)
        try:
            data = json.loads(self.rfile.read(size) or b'{}')
        except (ValueError, TypeError):
            data = {}
        path = urlsplit(self.path).path
        if '/analytics/' in path or '/facebook-conversions' in path:
            items = data.get('events', data.get('data', [data])) if isinstance(data, dict) else []
            if not isinstance(items, list):
                items = [items]
            with LOCK:
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    props = item.get('properties') or {}
                    EVENTS.append({'event_name': item.get('event_name'), 'session_id': item.get('session_id'),
                                   'product_id': props.get('product_id'), 'ad_id': props.get('ad_id'),
                                   'landing_session_id': props.get('landing_session_id'),
                                   'quantity': props.get('quantity'), 'path': path})
                del EVENTS[:-300]
            return self.respond(200, {'success': True, 'preview_only': True})
        self.respond(409, {'detail': 'Aperçu local : aucune commande réelle ne sera créée.'})

    def do_PATCH(self):
        self.respond(405, {'detail': 'Read-only preview.'})

    do_PUT = do_PATCH
    do_DELETE = do_PATCH


if __name__ == '__main__':
    print('Read-only preview API on http://127.0.0.1:5189; ALL upstream writes disabled.', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 5189), PreviewHandler).serve_forever()
