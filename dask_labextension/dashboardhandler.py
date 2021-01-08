"""
A Dashboard handler for the Dask labextension.
This proxies the bokeh server http and ws requests through the notebook
server, preventing CORS issues.
"""
import json
from urllib import parse

from tornado import httpclient, web

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from jupyter_server_proxy.handlers import ProxyHandler

from .manager import manager


class DaskDashboardCheckHandler(APIHandler):
    """
    A handler for checking validity of a dask dashboard.
    """

    @web.authenticated
    async def get(self, url) -> None:
        """
        Test if a given url string hosts a dask dashboard. Should always return a
        200 code, any errors are presumed to result from an invalid/inactive dashboard.
        """
        try:
            client = httpclient.AsyncHTTPClient()

            # Check the user-provided url, following any redirects.
            url = _normalize_dashboard_link(parse.unquote(url), self.request)
            response = await client.fetch(url)
            effective_url = response.effective_url if response.effective_url != url else None

            # Fetch the individual plots
            individual_plots_response = await client.fetch(
                url_path_join(
                    _normalize_dashboard_link(effective_url or url, self.request),
                    "individual-plots.json"
                    )
            )
            # If we didn't get individual plots, it may not be a dask dashboard
            if individual_plots_response.code != 200:
                raise ValueError("Does not seem to host a dask dashboard")
            individual_plots = json.loads(individual_plots_response.body)

            self.set_status(200)
            self.finish(json.dumps({
                "url": url,
                "isActive": response.code == 200,
                "effectiveUrl": effective_url,
                "plots": individual_plots,
            }))
        except:
            self.log.warn(f"{url} does not seem to host a dask dashboard")
            self.set_status(200)
            self.finish(json.dumps({
                "url": url,
                "isActive": False,
                "plots": {},
            }))


class DaskDashboardHandler(ProxyHandler):
    """
    A handler that proxies the dask dashboard to the notebook server.
    Currently the dashboard is assumed to be running on `localhost`.

    The functions `http_get`, `open`, `post`, `put`, `delete`,
    `head`, `patch`, `options`, and `proxy` are all overriding
    the base class with our own request handler parameters
    of `cluster_id` and `proxied_path`.

    The `proxy` function uses the cluster ID to get the port
    for the bokeh server from the Dask cluster manager. This
    port is then used to call the proxy method on the base class.
    """

    async def http_get(self, cluster_id, proxied_path):
        return await self.proxy(cluster_id, proxied_path)

    async def open(self, cluster_id, proxied_path):
        host, port = self._get_parsed(cluster_id)
        return await super().proxy_open(host, port, proxied_path)

    # We have to duplicate all these for now, I've no idea why!
    # Figure out a way to not do that?

    def post(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def put(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def delete(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def head(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def patch(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def options(self, cluster_id, proxied_path):
        return self.proxy(cluster_id, proxied_path)

    def proxy(self, cluster_id, proxied_path):
        host, port = self._get_parsed(cluster_id)
        return super().proxy(host, port, proxied_path)

    def _get_parsed(self, cluster_id):
        """
        Given a cluster ID, get the hostname and port of its bokeh server.
        """
        # Get the cluster by ID. If it is not found,
        # raise an error.
        cluster_model = manager.get_cluster(cluster_id)
        if not cluster_model:
            raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

        # Construct the proper websocket proxy link from the cluster dashboard
        dashboard_link = cluster_model["dashboard_link"]
        dashboard_link = _normalize_dashboard_link(dashboard_link, self.request)
        # Parse the url and return
        parsed = parse.urlparse(dashboard_link)
        port = parsed.port
        if not port:
            port = 443 if parsed.scheme == 'https' else 80
        if not parsed.hostname:
            raise web.HTTPError(500, "Dask dashboard URI malformed")
        return parsed.hostname, port


def _normalize_dashboard_link(link, request):
    """
    Given a dashboard link, make sure it conforms to what we expect.
    """
    if not link.startswith("http"):
        # If a local url is given, assume it is using the same host
        # as the application, and prepend that.
        link = url_path_join(f"{request.protocol}://{request.host}", link)
    if link.endswith("/status"):
        # If the default "status" dashboard is given, strip it.
        link = link[:-len("/status")]
    return link
