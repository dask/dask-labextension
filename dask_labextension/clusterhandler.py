"""Tornado handler for dask cluster management."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import json

from tornado import web
from notebook.base.handlers import APIHandler

from .manager import manager


class DaskClusterHandler(APIHandler):
    """
    A tornado HTTP handler for managing dask clusters.
    """

    @web.authenticated
    async def delete(self, cluster_id: str) -> None:
        """
        Delete a cluster by id.
        """
        try:  # to delete the cluster.
            val = await manager.close_cluster(cluster_id)
            if val is None:
                raise web.HTTPError(404, f"Dask cluster {cluster_id} not found")

            else:
                self.set_status(204)
                self.finish()
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def get(self, cluster_id: str = "") -> None:
        """
        Get a cluster by id. If no id is given, lists known clusters.
        """
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
    async def put(self, cluster_id: str = "") -> None:
        """
        Create a new cluster with a given id. If no id is given, a random
        one is selected.
        """
        if manager.get_cluster(cluster_id):
            raise web.HTTPError(
                403, f"A Dask cluster with ID {cluster_id} already exists!"
            )

        try:
            cluster_model = await manager.start_cluster(cluster_id)
            self.set_status(200)
            self.finish(json.dumps(cluster_model))
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def patch(self, cluster_id):
        """
        Scale an existing cluster."
        Not yet implemented.
        """
        new_model = json.loads(self.request.body)
        try:
            if new_model.get("adapt") != None:
                cluster_model = manager.adapt_cluster(
                    cluster_id,
                    new_model["adapt"]["minimum"],
                    new_model["adapt"]["maximum"],
                )
            elif new_model.get("adapt") == None:
                cluster_model = manager.scale_cluster(cluster_id, new_model["workers"])
            self.set_status(200)
            self.finish(json.dumps(cluster_model))
        except Exception as e:
            raise web.HTTPError(500, str(e))
