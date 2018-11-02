"""A manager for dask clusters."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

from typing import Any, Callable, Dict, List, Union
from uuid import uuid4

from dask.distributed import LocalCluster

# A type stub for a dask cluster.
DaskCluster = Any

# A type for a dask cluster model: a serializable
# representation of information about the cluster.
DaskClusterModel = Dict[str, Union[str, int]]

# A type stub for a Dask cluster factory.
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
        self._cluster_names: Dict[str, str] = dict()
        self._n_clusters = 0

    def start_cluster(self, cluster_id: str = "") -> Union[DaskClusterModel, None]:
        """
        Start a new Dask cluster.

        Parameters
        ----------
        cluster_id : string
            An optional string id for the cluster. If not given, a random id
            will be chosen.

        Returns
        cluster_model : a dask cluster model.
        """
        if not cluster_id:
            cluster_id = str(uuid4())
        cluster = self._cluster_factory()
        self._n_clusters = self._n_clusters + 1
        cluster_name = f"Dask Cluster {self._n_clusters}"
        self._clusters[cluster_id] = cluster
        self._cluster_names[cluster_id] = cluster_name
        return make_cluster_model(cluster_id, cluster_name, cluster)

    def close_cluster(self, cluster_id: str) -> Union[DaskClusterModel, None]:
        """
        Close a Dask cluster.

        Parameters
        ----------
        cluster_id : string
            A string id for the cluster.

        Returns
        cluster_model : the dask cluster model for the shut down cluster,
            or None if it was not found.
        """
        cluster = self._clusters.get(cluster_id)
        if cluster:
            cluster.close()
            self._clusters.pop(cluster_id)
            return make_cluster_model(
                cluster_id, self._cluster_names[cluster_id], cluster
            )

        else:
            return None

    def get_cluster(self, cluster_id) -> Union[DaskClusterModel, None]:
        """
        Get a Dask cluster model.

        Parameters
        ----------
        cluster_id : string
            A string id for the cluster.

        Returns
        cluster_model : the dask cluster model for the cluster,
            or None if it was not found.
        """
        cluster = self._clusters.get(cluster_id)
        return cluster

    def list_clusters(self) -> List[DaskClusterModel]:
        """
        List the Dask cluster models known to the manager.

        Returns
        cluster_models : A list of the dask cluster models known to the manager.
        """
        return [
            make_cluster_model(
                cluster_id, self._cluster_names[cluster_id], self._clusters[cluster_id]
            )
            for cluster_id in self._clusters
        ]


def local_cluster_factory():
    """
    A factory function for creating Dask clusters.
    """
    return LocalCluster(threads_per_worker=2, memory_limit="4GB")


def make_cluster_model(
    cluster_id: str, cluster_name: str, cluster: DaskCluster
) -> DaskClusterModel:
    """
    Make a cluster model.

    Parameters
    ----------
    cluster_id: string
        A unique string for the cluster.

    cluster_name: string
        A display name for the cluster.

    cluster: DaskCluster
        The cluster out of which to make the cluster model.
    """
    # This would be a great target for a dataclass
    # once python 3.7 is in wider use.
    return dict(
        id=cluster_id,
        name=cluster_name,
        scheduler_address=cluster.scheduler_address,
        dashboard_link=cluster.dashboard_link or '',
        workers=len(cluster.workers),
    )
