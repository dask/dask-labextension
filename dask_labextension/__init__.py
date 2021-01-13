"""A Jupyter server extension for managing Dask clusters."""

from jupyter_server.utils import url_path_join

from . import config
from .clusterhandler import DaskClusterHandler
from .dashboardhandler import DaskDashboardCheckHandler, DaskDashboardHandler


from ._version import get_versions

__version__ = get_versions()["version"]
del get_versions


def _jupyter_server_extension_paths():
    return [{"module": "dask_labextension"}]


def load_jupyter_server_extension(nb_server_app):
    """
    Called when the extension is loaded.

    Args:
        nb_server_app (NotebookWebApplication): handle to the Notebook webserver instance.
    """
    cluster_id_regex = r"(?P<cluster_id>\w+-\w+-\w+-\w+-\w+)"
    web_app = nb_server_app.web_app
    base_url = web_app.settings["base_url"]
    get_cluster_path = url_path_join(base_url, "dask/clusters/" + cluster_id_regex)
    list_clusters_path = url_path_join(base_url, "dask/clusters/" + "?")
    get_dashboard_path = url_path_join(
        base_url, f"dask/dashboard/{cluster_id_regex}(?P<proxied_path>.+)"
    )
    check_dashboard_path = url_path_join(base_url, "dask/dashboard-check/(?P<url>.+)")
    handlers = [
        (get_cluster_path, DaskClusterHandler),
        (list_clusters_path, DaskClusterHandler),
        (get_dashboard_path, DaskDashboardHandler),
        (check_dashboard_path, DaskDashboardCheckHandler),
    ]
    web_app.add_handlers(".*$", handlers)
