"""A manager for dask clusters."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

from typing import Any, Callable, Dict, List, Union
from uuid import uuid4

from dask.distributed import LocalCluster

DaskCluster = Any
DaskClusterFactory = Callable[[], DaskCluster]


class DaskClusterManager:
    """
    A class for starting, stopping, and otherwise managing the lifecycle
    of Dask clusters.
    """

    def __init__(self, cluster_factory: Union[DaskClusterFactory, None] = None) -> None:
        """
        Initialize the cluster manager.

        Parameters
        ----------
        cluster_factory : function
            An optional function that, when called, creates a new
            Dask cluster for usage. If not given, defaults to a LocalCluster.
        """

        if cluster_factory:
            self._cluster_factory: DaskClusterFactory = cluster_factory
        else:
            self._cluster_factory: DaskClusterFactory = local_cluster_factory

        self._clusters: Dict[str, DaskCluster] = dict()

    def start_cluster(self, cluster_id: str = "") -> str:
        if not cluster_id:
            cluster_id = str(uuid4())
        cluster = self._cluster_factory()
        self._clusters[cluster_id] = cluster
        return cluster_id

    def close_cluster(self, cluster_id: str) -> str:
        cluster = self._clusters.get(cluster_id)
        if cluster:
            cluster.close()
            self._clusters.pop(cluster_id)
        return cluster_id

    def get_cluster(self, cluster_id) -> DaskCluster:
        cluster = self._clusters.get(cluster_id)
        return cluster

    def list_clusters(self) -> List[str]:
        return [cluster_id for cluster_id in self._clusters]


def local_cluster_factory():
    return LocalCluster(threads_per_worker=2, memory_limit="4GB")
