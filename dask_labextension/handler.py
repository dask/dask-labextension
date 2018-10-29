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
                self.set_status(404)
            else:
                self.set_status(204)
                self.finish()
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def get(self, cluster_id: str) -> None:
        if cluster_id == "":
            cluster_ids = manager.list_clusters()
            cluster_list = [
                make_cluster_model(id, manager.get_cluster(id)) for id in cluster_ids
            ]
            self.set_status(200)
            self.finish(json.dumps(cluster_list))
        else:
            cluster = manager.get_cluster(cluster_id)
            if cluster is None:
                self.set_status(404)
                self.finish()

            response = dict(
                id=cluster_id,
                dashboard_link=cluster.dashboard_link,
                workers=len(cluster.workers),
            )
            self.set_status(200)
            self.finish(json.dumps(response))

    @web.authenticated
    def put(self, cluster_id: str) -> None:
        if manager.get_cluster(cluster_id):
            self.set_status(403)
            self.finish("A cluster with this ID already exists!")
        try:
            cluster_id = manager.start_cluster(cluster_id)
            cluster = manager.get_cluster(cluster_id)
            self.set_status(200)
            self.finish(json.dumps(make_cluster_model(cluster_id, cluster)))
        except Exception as e:
            raise web.HTTPError(500, str(e))

    @web.authenticated
    def patch(self, cluster_id):
        pass

def make_cluster_model(
    cluster_id: str, cluster: DaskCluster
) -> Dict[str, Union[str, int]]:
    return dict(
        id=cluster_id,
        dashboard_link=cluster.dashboard_link,
        workers=len(cluster.workers),
    )
