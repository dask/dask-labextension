"""Tornado handlers for dask cluster management."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
from tornado import web
from notebook.base.handlers import APIHandler



class DaskClusterHandler(APIHandler):

    @web.authenticated
    def delete(self, cluster_id):
        try:  # to delete the cluster.
            return self.set_status(204)
        except Exception as e:
            raise web.HTTPError(500, str(e))

#     @web.authenticated
    def get(self, cluster_id):
        self.set_status(200)
        self.finish('Hello')

    @web.authenticated
    def put(self, cluster_id):
        pass

    @web.authenticated
    def patch(self, cluster_id):
        pass
