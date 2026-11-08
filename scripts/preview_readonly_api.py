"""Loopback-only design preview: public GET data, no upstream writes, no real orders.

Run this alongside npm run preview:local. Live product reads are cached in memory.
Only event names and non-personal funnel IDs are retained for local QA.

  python3 scripts/preview_readonly_api.py [--fake-orders]

--fake-orders answers order creation with a local, fake confirmation (order number
FL-PREVIEW-…) so the whole checkout can be walked to the order-success page. Nothing is
sent upstream and the request body is not kept.

BabiDrama picks (order-success card) are read from babidrama.com through the same proxy
(PREVIEW_HTTPS_PROXY, a Côte d'Ivoire-allowed exit) with the shop's Origin; covers are served
through /bdimg/. Displays, clicks and opens stay in this process (/__qa/drama-events): they
never reach BabiDrama's ranking.

The card's episode route is read the same way; its signed video URLs are rewritten to /bdvideo/
(streamed from v.babidrama.com with the Range header, so the <video> can seek) and its poster to
/bdimg/. The dev fixture (?preview_order_success=1&preview_drama=1) plays a 10 s test video
generated once with ffmpeg in /tmp/cod-preview-drama and served from /bdtest/.
"""
import json
import os
import re
import shutil
import subprocess
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
BABIDRAMA_VIDEOS = 'https://v.babidrama.com/'
PREVIEW_VIDEOS = 'http://127.0.0.1:4173/__preview/api/bdvideo/'
SHOP_ORIGIN = 'https://www.brainnel.com'
EPISODE_REQUESTS = []
TEST_MEDIA_DIR = '/tmp/cod-preview-drama'
TEST_MEDIA = {'episode-480p.mp4': 'video/mp4', 'poster.jpg': 'image/jpeg'}
TEST_MEDIA_LOCK = threading.Lock()
CHUNK = 64 * 1024
RELAYED_MEDIA_HEADERS = ('Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified')


def ensure_test_media():
    """10 s 9:16 test pattern with a tone, and its poster; generated once, never committed."""
    with TEST_MEDIA_LOCK:
        video = os.path.join(TEST_MEDIA_DIR, 'episode-480p.mp4')
        poster = os.path.join(TEST_MEDIA_DIR, 'poster.jpg')
        if os.path.exists(video) and os.path.exists(poster):
            return True
        ffmpeg = shutil.which('ffmpeg')
        if not ffmpeg:
            return False
        os.makedirs(TEST_MEDIA_DIR, exist_ok=True)
        partial = video + '.part.mp4'
        try:
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error',
                            '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=25:duration=10',
                            '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=10',
                            '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
                            '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', partial],
                           check=True, timeout=120)
            subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-ss', '1', '-i', partial,
                            '-frames:v', '1', poster], check=True, timeout=60)
            os.replace(partial, video)
            return True
        except (OSError, subprocess.SubprocessError):
            return False


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
                return self.respond(200, {'events': list(DRAMA_EVENTS), 'episode_requests': list(EPISODE_REQUESTS),
                                          'upstream_writes': 0})
        if path == '/babidrama/api/partner/brainnel/picks':
            return self.drama_picks()
        if path == '/babidrama/api/partner/brainnel/episode':
            return self.drama_episode()
        if path.startswith('/bdimg/'):
            return self.drama_image(path[len('/bdimg/'):])
        if path.startswith('/bdvideo/'):
            return self.drama_video()
        if path.startswith('/bdtest/'):
            return self.drama_test_media(path[len('/bdtest/'):])
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

    def drama_episode(self):
        query = urlsplit(self.path).query
        with LOCK:
            EPISODE_REQUESTS.append({'query': query, 'at': time.strftime('%H:%M:%S')})
            del EPISODE_REQUESTS[:-100]
        try:
            response = requests.get(f'{BABIDRAMA}/api/partner/brainnel/episode?{query}', proxies=upstream_proxies(),
                                    headers={'Origin': SHOP_ORIGIN, 'Accept': 'application/json'},
                                    timeout=20, allow_redirects=False)
            data = response.json()
        except Exception:
            return self.respond(502, {'detail': 'Preview could not read the BabiDrama episode.'})
        if isinstance(data, dict):
            urls = data.get('urls')
            for name, url in list(urls.items()) if isinstance(urls, dict) else []:
                if isinstance(url, str) and url.startswith(BABIDRAMA_VIDEOS):
                    urls[name] = PREVIEW_VIDEOS + url[len(BABIDRAMA_VIDEOS):]
            poster = data.get('posterUrl')
            if isinstance(poster, str) and poster.startswith(BABIDRAMA_IMAGES):
                data['posterUrl'] = PREVIEW_IMAGES + quote(poster[len(BABIDRAMA_IMAGES):])
        self.respond(response.status_code, data)

    def drama_video(self):
        """Streams a signed video (query string kept) with the browser's Range header."""
        split = urlsplit(self.path)
        key = split.path[len('/bdvideo/'):]
        if '..' in key or not key.startswith('v/'):
            return self.respond(400, {'detail': 'Bad video path.'})
        headers = {'Origin': SHOP_ORIGIN, 'Accept-Encoding': 'identity'}
        if self.headers.get('Range'):
            headers['Range'] = self.headers['Range']
        try:
            upstream = requests.get(BABIDRAMA_VIDEOS + key + (f'?{split.query}' if split.query else ''),
                                    headers=headers, proxies=upstream_proxies(), timeout=(10, 30),
                                    stream=True, allow_redirects=False)
        except Exception:
            return self.respond(502, {'detail': 'Preview could not read the video.'})
        with upstream:
            self.send_response(upstream.status_code)
            for name in RELAYED_MEDIA_HEADERS:
                if upstream.headers.get(name):
                    self.send_header(name, upstream.headers[name])
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            try:
                for chunk in upstream.raw.stream(CHUNK, decode_content=False):
                    self.wfile.write(chunk)
            except Exception:
                # The browser cancels ranges it no longer needs; the upstream read stops with it.
                pass

    def drama_test_media(self, name):
        if name not in TEST_MEDIA:
            return self.respond(404, {'detail': 'Unknown test media.'})
        if not ensure_test_media():
            return self.respond(503, {'detail': 'ffmpeg is needed to generate the test video.'})
        path = os.path.join(TEST_MEDIA_DIR, name)
        size = os.path.getsize(path)
        start, end, status = 0, size - 1, 200
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
            if match and match.group(1):
                start = int(match.group(1))
                end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
            elif match and match.group(2):
                start = max(0, size - int(match.group(2)))
            if not match or (not match.group(1) and not match.group(2)) or start > end:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
            status = 206
        self.send_response(status)
        self.send_header('Content-Type', TEST_MEDIA[name])
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            with open(path, 'rb') as handle:
                handle.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = handle.read(min(CHUNK, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except OSError:
            pass
        return None

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
