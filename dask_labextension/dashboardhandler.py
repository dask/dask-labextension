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

from .manager import manager


class PingableWSClientConnection(websocket.WebSocketClientConnection):
    """A WebSocketClientConnection with an on_ping callback."""

    def __init__(self, **kwargs):
        if "on_ping_callback" in kwargs:
            self._on_ping_callback = kwargs["on_ping_callback"]
            del (kwargs["on_ping_callback"])
        super().__init__(**kwargs)

    def on_ping(self, data):
        if self._on_ping_callback:
            self._on_ping_callback(data)


def pingable_ws_connect(request=None, on_message_callback=None, on_ping_callback=None):
    """
    A variation on websocket_connect that returns a PingableWSClientConnection
    with on_ping_callback.
    """
    # Copy and convert the headers dict/object (see comments in
    # AsyncHTTPClient.fetch)
    request.headers = httputil.HTTPHeaders(request.headers)
    request = httpclient._RequestProxy(request, httpclient.HTTPRequest._DEFAULTS)

    # for tornado 4.5.x compatibility
    if version_info[0] == 4:
        conn = PingableWSClientConnection(
            io_loop=ioloop.IOLoop.current(),
            request=request,
            on_message_callback=on_message_callback,
            on_ping_callback=on_ping_callback,
        )
    else:
        conn = PingableWSClientConnection(
            request=request,
            on_message_callback=on_message_callback,
            on_ping_callback=on_ping_callback,
            max_message_size=getattr(
                websocket, "_default_max_message_size", 10 * 1024 * 1024
            ),
        )

    return conn.connect_future


# from https://stackoverflow.com/questions/38663666/how-can-i-serve-a-http-page-and-a-websocket-on-the-same-url-in-tornado


class WebSocketHandlerMixin(websocket.WebSocketHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # since my parent doesn't keep calling the super() constructor,
        # I need to do it myself
        bases = inspect.getmro(type(self))
        assert WebSocketHandlerMixin in bases
        meindex = bases.index(WebSocketHandlerMixin)
        try:
            nextparent = bases[meindex + 1]
        except IndexError:
            raise Exception(
                "WebSocketHandlerMixin should be followed "
                "by another parent to make sense"
            )

        # undisallow methods --- t.ws.WebSocketHandler disallows methods,
        # we need to re-enable these methods

        def wrapper(method):

            def undisallow(*args2, **kwargs2):
                getattr(nextparent, method)(self, *args2, **kwargs2)

            return undisallow

        for method in [
            "write",
            "redirect",
            "set_header",
            "set_cookie",
            "set_status",
            "flush",
            "finish",
        ]:
            setattr(self, method, wrapper(method))
        nextparent.__init__(self, *args, **kwargs)

    async def get(self, *args, **kwargs):
        if self.request.headers.get("Upgrade", "").lower() != "websocket":
            return await self.http_get(*args, **kwargs)

        # super get is not async
        super().get(*args, **kwargs)


class DaskDashboardHandler(WebSocketHandlerMixin, IPythonHandler):

    async def open(self, cluster_id, proxied_path=""):
        """
        Called when a client opens a websocket connection.
        We establish a websocket connection to the proxied backend &
        set up a callback to relay messages through.
        """

        # Get the cluster by ID. If it is not found,
        # raise an error.
        cluster_model = manager.get_cluster(cluster_id)
        if not cluster_model:
            raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

        # Construct the proper websocket proxy link from the cluster dashboard
        dashboard_link = cluster_model["dashboard_link"]
        dashboard_link = _normalize_dashboard_link(dashboard_link, self.request)
        # Convert to a websocket protocol.
        ws_link = "ws" + dashboard_link[4:]

        if not proxied_path.startswith("/"):
            proxied_path = "/" + proxied_path

        client_uri = "{ws_link}{path}".format(ws_link=ws_link, path=proxied_path)
        self.log.warn(ws_link)
        if self.request.query:
            client_uri += "?" + self.request.query
        headers = self.request.headers

        def message_cb(message):
            """
            Callback when the backend sends messages to us
            We just pass it back to the frontend
            """
            # Websockets support both string (utf-8) and binary data, so let's
            # make sure we signal that appropriately when proxying
            self._record_activity()
            if message is None:
                self.close()
            else:
                self.write_message(message, binary=isinstance(message, bytes))

        def ping_cb(data):
            """
            Callback when the backend sends pings to us.
            We just pass it back to the frontend.
            """
            self._record_activity()
            self.ping(data)

        async def start_websocket_connection():
            self.log.info(
                "Trying to establish websocket connection to {}".format(client_uri)
            )
            self._record_activity()
            request = httpclient.HTTPRequest(url=client_uri, headers=headers)
            self.ws = await pingable_ws_connect(
                request=request,
                on_message_callback=message_cb,
                on_ping_callback=ping_cb,
            )
            self._record_activity()
            self.log.info("Websocket connection established to {}".format(client_uri))

        ioloop.IOLoop.current().add_callback(start_websocket_connection)

    def on_message(self, message):
        """
        Called when we receive a message from our client.
        We proxy it to the backend.
        """
        self._record_activity()
        if hasattr(self, "ws"):
            self.ws.write_message(message, binary=isinstance(message, bytes))

    def on_ping(self, data):
        """
        Called when the client pings our websocket connection.
        We proxy it to the backend.
        """
        self.log.debug("nbserverproxy: on_ping: {}".format(data))
        self._record_activity()
        if hasattr(self, "ws"):
            self.ws.protocol.write_ping(data)

    def on_pong(self, data):
        """
        Called when we receive a ping back.
        """
        self.log.debug("nbserverproxy: on_pong: {}".format(data))

    def on_close(self):
        """
        Called when the client closes our websocket connection.
        We close our connection to the backend too.
        """
        if hasattr(self, "ws"):
            self.ws.close()

    def _record_activity(self):
        """Record proxied activity as API activity
        avoids proxied traffic being ignored by the notebook's
        internal idle-shutdown mechanism
        """
        self.settings["api_last_activity"] = utcnow()

    @web.authenticated
    async def proxy(self, cluster_id, proxied_path):
        """
        While self.request.uri is
            (hub)    /user/username/proxy/([0-9]+)/something.
            (single) /proxy/([0-9]+)/something
        This serverextension is given {port}/{everything/after}.
        """

        if "Proxy-Connection" in self.request.headers:
            del self.request.headers["Proxy-Connection"]

        self._record_activity()

        if self.request.headers.get("Upgrade", "").lower() == "websocket":
            # We wanna websocket!
            # jupyterhub/nbserverproxy@36b3214
            self.log.info(
                "we wanna websocket, but we don't define WebSocketProxyHandler"
            )
            self.set_status(500)

        body = self.request.body
        if not body:
            if self.request.method == "POST":
                body = b""
            else:
                body = None

        # Get the cluster by ID. If it is not found,
        # raise an error.
        cluster_model = manager.get_cluster(cluster_id)
        if not cluster_model:
            raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

        # Construct the proper proxy link from the cluster dashboard
        dashboard_link = cluster_model["dashboard_link"]
        dashboard_link = _normalize_dashboard_link(dashboard_link, self.request)

        # If a path is not provided, default to the individual plots listing.
        proxied_path = proxied_path or "individual-plots.json"

        client_uri = "{dashboard_link}/{path}".format(
            dashboard_link=dashboard_link, path=proxied_path
        )
        if self.request.query:
            client_uri += "?" + self.request.query

        client = httpclient.AsyncHTTPClient()

        req = httpclient.HTTPRequest(
            client_uri,
            method=self.request.method,
            body=body,
            headers=self.request.headers,
            follow_redirects=False,
        )

        response = await client.fetch(req, raise_error=False)
        # record activity at start and end of requests
        self._record_activity()

        # For all non http errors...
        if response.error and type(response.error) is not httpclient.HTTPError:
            self.set_status(500)
            self.write(str(response.error))
        else:
            self.set_status(response.code, response.reason)

            # clear tornado default header
            self._headers = httputil.HTTPHeaders()

            for header, v in response.headers.get_all():
                if header not in (
                    "Content-Length",
                    "Transfer-Encoding",
                    "Content-Encoding",
                    "Connection",
                ):
                    # some header appear multiple times, eg 'Set-Cookie'
                    self.add_header(header, v)

            if response.body:
                self.write(response.body)

    # Support all the methods that torando does by default except for GET which
    # is passed to WebSocketHandlerMixin and then to WebSocketHandler.

    async def http_get(self, cluster_id, proxied_path=""):
        """Our non-websocket GET."""
        return await self.proxy(cluster_id, proxied_path)

    def post(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def put(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def delete(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def head(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def patch(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def options(self, cluster_id, proxied_path=""):
        return self.proxy(cluster_id, proxied_path)

    def check_xsrf_cookie(self):
        """
        http://www.tornadoweb.org/en/stable/guide/security.html
        Defer to proxied apps.
        """
        pass

    def select_subprotocol(self, subprotocols):
        """Select a single Sec-WebSocket-Protocol during handshake."""
        if isinstance(subprotocols, list) and subprotocols:
            self.log.info("Client sent subprotocols: {}".format(subprotocols))
            return subprotocols[0]

        return super().select_subprotocol(subprotocols)


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
