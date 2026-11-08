"""Loopback-only design preview: public GET data, no upstream writes, no real orders.

Run this alongside npm run preview:local. Live product reads are cached in memory.
Only event names and non-personal funnel IDs are retained for local QA.

  python3 scripts/preview_readonly_api.py [--fake-orders]

--fake-orders answers order creation with a local, fake confirmation (order number
FL-PREVIEW-…) so the whole checkout can be walked to the order-success page. Nothing is
sent upstream and the request body is not kept.

BabiDrama picks (order-success card) are read from babidrama.com through the same proxy
(PREVIEW_HTTPS_PROXY, a Côte d'Ivoire-allowed exit) with the shop's Origin; covers are served
through /bdimg/. Displays and clicks stay in this process (/__qa/drama-events): they never
reach BabiDrama's ranking.
"""
import json
import os
import sys
from urllib.parse import quote
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import requests

CACHE = {}
EVENTS = []
QA_DISTRICTS_FAIL = False
LOCK = threading.Lock()
READ_PATHS = ('/api/flash-local/', '/api/vite/app/download-links')
FAKE_ORDERS = '--fake-orders' in sys.argv
DRAMA_EVENTS = []
FAKE_ORDER_COUNT = 0
BABIDRAMA = 'https://babidrama.com'
BABIDRAMA_IMAGES = 'https://img.babidrama.com/'
PREVIEW_IMAGES = 'http://127.0.0.1:4173/__preview/api/bdimg/'
SHOP_ORIGIN = 'https://www.brainnel.com'


def upstream_proxies():
    return {'https': os.environ.get('PREVIEW_HTTPS_PROXY', 'http://127.0.0.1:7897')}


class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, data):
        if data is None:
            self.send_response(status)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
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
        if path == '/__qa/drama-events':
            with LOCK:
                return self.respond(200, {'events': list(DRAMA_EVENTS), 'upstream_writes': 0})
        if path == '/babidrama/api/partner/brainnel/picks':
            return self.drama_picks()
        if path.startswith('/bdimg/'):
            return self.drama_image(path[len('/bdimg/'):])
        if path == '/api/flash-local/cities-and-districts/' and QA_DISTRICTS_FAIL:
            return self.respond(503, {'detail': 'Local QA simulated district outage.'})
        if not path.startswith(READ_PATHS) or any(x in path for x in ['/orders', '/order/', '/user', '/cart']):
            return self.respond(403, {'detail': 'This endpoint is not part of the read-only preview.'})
        try:
            with LOCK:
                cached = CACHE.get(self.path)
            if cached and time.monotonic() - cached[0] < 300:
                return self.respond(cached[1], cached[2])
            response = requests.get('https://api.brainnel.com/backend' + self.path,
                                    proxies={'https': os.environ.get('PREVIEW_HTTPS_PROXY', 'http://127.0.0.1:7897')}, timeout=30,
                                    allow_redirects=False)
            data = response.json()
            with LOCK:
                CACHE[self.path] = (time.monotonic(), response.status_code, data)
            self.respond(response.status_code, data)
        except Exception:
            self.respond(502, {'detail': 'Preview could not read live product data. Retry shortly.'})

    def do_POST(self):
        global QA_DISTRICTS_FAIL
        size = min(int(self.headers.get('Content-Length', '0')), 100_000)
        try:
            data = json.loads(self.rfile.read(size) or b'{}')
        except (ValueError, TypeError):
            data = {}
        path = urlsplit(self.path).path
        if path == '/__qa/district-failure':
            QA_DISTRICTS_FAIL = bool(data.get('enabled'))
            return self.respond(200, {'enabled': QA_DISTRICTS_FAIL, 'upstream_writes': 0})
        if path == '/babidrama/api/partner/brainnel/events':
            events = data.get('events') if isinstance(data, dict) else None
            with LOCK:
                for event in events if isinstance(events, list) else []:
                    if isinstance(event, dict):
                        DRAMA_EVENTS.append({'pid': data.get('pid'), 'type': event.get('type'),
                                             'slug': event.get('slug'), 'slot': event.get('slot')})
                del DRAMA_EVENTS[:-300]
            return self.respond(204, None)
        if FAKE_ORDERS and (path == '/api/flash-local/orders/' or
                            (path.startswith('/api/flash-local/bundles/') and path.endswith('/create-order'))):
            return self.fake_order(path)
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
                                   'quantity': props.get('quantity'), 'path': path,
                                   **{key: value for key, value in props.items() if key.startswith('checkout_optimization_') or key == 'product_clarity_rendered'}})
                del EVENTS[:-300]
            return self.respond(200, {'success': True, 'preview_only': True})
        self.respond(409, {'detail': 'Aperçu local : aucune commande réelle ne sera créée.'})

    def fake_order(self, path):
        global FAKE_ORDER_COUNT
        with LOCK:
            FAKE_ORDER_COUNT += 1
            number = FAKE_ORDER_COUNT
            EVENTS.append({'event_name': 'preview_fake_order_created', 'path': path})
        stamp = time.strftime('%H%M%S')
        # No `items`: the browser Purchase payload is not built for a fake order.
        return self.respond(200, {'order_id': f'preview-{stamp}-{number}',
                                  'order_no': f'FL-PREVIEW-{stamp}-{number}', 'preview_only': True})

    def drama_picks(self):
        query = urlsplit(self.path).query
        try:
            response = requests.get(f'{BABIDRAMA}/api/partner/brainnel/picks?{query}', proxies=upstream_proxies(),
                                    headers={'Origin': SHOP_ORIGIN, 'Accept': 'application/json'},
                                    timeout=20, allow_redirects=False)
            data = response.json()
        except Exception:
            return self.respond(502, {'detail': 'Preview could not read BabiDrama picks.'})
        for series in data.get('series', []) if isinstance(data, dict) else []:
            cover = series.get('coverUrl')
            if isinstance(cover, str) and cover.startswith(BABIDRAMA_IMAGES):
                series['coverUrl'] = PREVIEW_IMAGES + quote(cover[len(BABIDRAMA_IMAGES):])
        self.respond(response.status_code, data)

    def drama_image(self, key):
        if '..' in key:
            return self.respond(400, {'detail': 'Bad image path.'})
        try:
            response = requests.get(BABIDRAMA_IMAGES + key, proxies=upstream_proxies(), timeout=20)
        except Exception:
            return self.respond(502, {'detail': 'Preview could not read the cover.'})
        body = response.content
        self.send_response(response.status_code)
        self.send_header('Content-Type', response.headers.get('Content-Type', 'image/webp'))
        self.send_header('Cache-Control', 'max-age=3600')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PATCH(self):
        self.respond(405, {'detail': 'Read-only preview.'})

    do_PUT = do_PATCH
    do_DELETE = do_PATCH


if __name__ == '__main__':
    print('Read-only preview API on http://127.0.0.1:5189; ALL upstream writes disabled.'
          + (' Fake order confirmations ON.' if FAKE_ORDERS else ''), flush=True)
    ThreadingHTTPServer(('127.0.0.1', 5189), PreviewHandler).serve_forever()
