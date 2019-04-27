"""
A Dashboard handler for the Dask labextension.
This proxies the bokeh server http and ws requests through the notebook
server, preventing CORS issues.

Modified from the nbserverproxy project.
"""

import inspect

from tornado import web, httpclient, httputil, websocket, ioloop, version_info

from notebook.base.handlers import IPythonHandler, utcnow
from notebook.utils import url_path_join
from jupyter_server_proxy.handlers import LocalProxyHandler
from functools import partial
try:
    from notebook import maybe_future
except ImportError:
    from tornado.gen import maybe_future

from .manager import manager


def make_dashboard_handler(base_url, cluster_id, port):
    return (
        url_path_join(base_url, f'/dask/dashboard/{cluster_id}(.*)'),
        partial(DaskDashboardHandler, port=port),
        {'absolute_url': False}
    )

class DaskDashboardHandler(LocalProxyHandler):
    def __init__(self, port, *args, **kwargs):
        self.port = port
        super().__init__(*args, **kwargs)

    async def http_get(self, path):
        return await self.proxy(path)

    async def open(self, path):
        return await super().open(path)

    # We have to duplicate all these for now, I've no idea why!
    # Figure out a way to not do that?
    def post(self, path):
        return self.proxy(path)

    def put(self, path):
        return self.proxy(path)

    def delete(self, path):
        return self.proxy(path)

    def head(self, path):
        return self.proxy(path)

    def patch(self, path):
        return self.proxy(path)

    def options(self, path):
        return self.proxy(path)

def _normalize_dashboard_link(link, request):
    """
    Given a dashboard link, make sure it conforms to what we expect.
    """
    if not link.startswith('http'):
        # If a local url is given, assume it is using the same host
        # as the application, and prepend that.
        link = url_path_join(f"{request.protocol}://{request.host}", link)
    if link.endswith("/status"):
        # If the default "status" dashboard is give, strip it.
        link = link[:-len("/status")]
    return link
