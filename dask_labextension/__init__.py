"""A Jupyter notebook server extension for managing Dask clusters."""

from notebook.utils import url_path_join

from . import config
from .clusterhandler import DaskClusterHandler
from .dashboardhandler import DaskDashboardHandler
from ._version import __version__


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
    handlers = [
        (get_cluster_path, DaskClusterHandler),
        (list_clusters_path, DaskClusterHandler),
        (get_dashboard_path, DaskDashboardHandler),
    ]
    web_app.add_handlers(".*$", handlers)
