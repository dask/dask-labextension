"""A Jupyter notebook server extension for managing Dask clusters."""

from notebook.utils import url_path_join

from .handler import DaskClusterHandler

__version__ = '0.7.0'

def _jupyter_server_extension_paths():
    return [{
        'module': 'dask-labextension'
    }]

def load_jupyter_server_extension(nb_server_app):
    """
    Called when the extension is loaded.

    Args:
        nb_server_app (NotebookWebApplication): handle to the Notebook webserver instance.
    """
    web_app = nb_server_app.web_app
    base_url = web_app.settings['base_url']
    endpoint = url_path_join(base_url, 'dask')
    handlers = [(endpoint + "(.*)", DaskClusterHandler)]
    web_app.add_handlers('.*$', handlers)
