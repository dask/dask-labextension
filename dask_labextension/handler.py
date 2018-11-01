"""Tornado handlers for dask cluster management."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import json
from typing import Dict, Union

from tornado import web
from notebook.base.handlers import APIHandler

from .manager import DaskCluster, DaskClusterManager

# Create a default cluster manager
# to keep track of clusters.
manager = DaskClusterManager()


class DaskClusterHandler(APIHandler):

    @web.authenticated
    def delete(self, cluster_id: str) -> None:
        try:  # to delete the cluster.
            val = manager.close_cluster(cluster_id)
            if val is None:
                raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

            else:
                self.set_status(204)
                self.finish()
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def get(self, cluster_id: str = "") -> None:
        if cluster_id == "":
            cluster_list = manager.list_clusters()
            self.set_status(200)
            self.finish(json.dumps(cluster_list))
        else:
            cluster_model = manager.get_cluster(cluster_id)
            if cluster_model is None:
                raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

            self.set_status(200)
            self.finish(json.dumps(cluster_model))

    @web.authenticated
    def put(self, cluster_id: str = "") -> None:
        if manager.get_cluster(cluster_id):
            raise web.HTTPError(
                403, f"A Dask cluster with ID {cluster_id} already exists!"
            )
        try:
            cluster_model = manager.start_cluster(cluster_id)
            self.set_status(200)
            self.finish(json.dumps(cluster_model))
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def patch(self, cluster_id):
        pass
