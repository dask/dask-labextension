"""A manager for dask clusters."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import functools
import importlib
from typing import Any, Callable, Dict, List, Union
from uuid import uuid4

import dask
from dask.distributed import Adaptive, utils

# A type for a dask cluster model: a serializable
# representation of information about the cluster.
ClusterModel = Dict[str, Union[str, int]]

# A type stub for a Dask cluster.
Cluster = Any

# A type stub for a Dask cluster factory.
DaskClusterFactory = Callable[[], Cluster]

# Get default cluster factory from configuration
default_factory_module = importlib.import_module(dask.config.get('labextension.factory.module'))
default_factory = getattr(default_factory_module, dask.config.get('labextension.factory.class'))
if dask.config.get('labextension.factory.args') or dask.config.get('labextension.factory.kwargs'):
    default_factory = functools.partial(default_factory,
                                        *dask.config.get('labextension.factory.args'),
                                        **dask.config.get('labextension.factory.kwargs'))


class DaskClusterManager:
    """
    A class for starting, stopping, and otherwise managing the lifecycle
    of Dask clusters.
    """

    def __init__(self, cluster_factory: DaskClusterFactory = default_factory) -> None:
        """
        Initialize the cluster manager.

        Parameters
        ----------
        cluster_factory : function
            An optional function that, when called, creates a new
            Dask cluster for usage. If not given, defaults to a LocalCluster.
        """
        self._cluster_factory: DaskClusterFactory = cluster_factory
        self._clusters: Dict[str, Cluster] = dict()
        self._adaptives: Dict[str, Adaptive] = dict()
        self._cluster_names: Dict[str, str] = dict()
        self._n_clusters = 0

    def start_cluster(self, cluster_id: str = "") -> ClusterModel:
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
        self._n_clusters += 1
        cluster_type = type(cluster).__name__
        cluster_name = f"{cluster_type} {self._n_clusters}"
        self._clusters[cluster_id] = cluster
        self._cluster_names[cluster_id] = cluster_name
        return make_cluster_model(cluster_id, cluster_name, cluster, adaptive=None)

    def close_cluster(self, cluster_id: str) -> Union[ClusterModel, None]:
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
            name = self._cluster_names.pop(cluster_id)
            adaptive = self._adaptives.pop(cluster_id, None)
            return make_cluster_model(cluster_id, name, cluster, adaptive)

        else:
            return None

    def get_cluster(self, cluster_id) -> Union[ClusterModel, None]:
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
        name = self._cluster_names.get(cluster_id, '')
        adaptive = self._adaptives.get(cluster_id)
        if not cluster:
            return None

        return make_cluster_model(cluster_id, name, cluster, adaptive)

    def list_clusters(self) -> List[ClusterModel]:
        """
        List the Dask cluster models known to the manager.

        Returns
        cluster_models : A list of the dask cluster models known to the manager.
        """
        return [
            make_cluster_model(
                cluster_id,
                self._cluster_names[cluster_id],
                self._clusters[cluster_id],
                self._adaptives.get(cluster_id, None),
            )
            for cluster_id in self._clusters
        ]

    def scale_cluster(self, cluster_id: str, n: int) -> Union[ClusterModel, None]:
        cluster = self._clusters.get(cluster_id)
        name = self._cluster_names[cluster_id]
        adaptive = self._adaptives.pop(cluster_id, None)

        # Check if the cluster exists
        if not cluster:
            return None

        # Check if it is actually different.
        model = make_cluster_model(cluster_id, name, cluster, adaptive)
        if model["scaling"] == "static" and model["workers"] == n:
            return model

        # Otherwise, rescale the model.
        cluster.scale(n)
        return make_cluster_model(cluster_id, name, cluster, adaptive=None)

    def adapt_cluster(
        self, cluster_id: str, minimum: int, maximum: int
    ) -> Union[ClusterModel, None]:
        cluster = self._clusters.get(cluster_id)
        name = self._cluster_names[cluster_id]
        adaptive = self._adaptives.pop(cluster_id, None)

        # Check if the cluster exists
        if not cluster:
            return None

        # Check if it is actually different.
        model = make_cluster_model(cluster_id, name, cluster, adaptive)
        if model["scaling"] == "adaptive" and model["minimum"] == minimum and model[
            "maximum"
        ] == maximum:
            return model

        # Otherwise, rescale the model.
        adaptive = cluster.adapt(minimum=minimum, maximum=maximum)
        self._adaptives[cluster_id] = adaptive
        return make_cluster_model(cluster_id, name, cluster, adaptive)


def make_cluster_model(
    cluster_id: str,
    cluster_name: str,
    cluster: Cluster,
    adaptive: Union[Adaptive, None],
) -> ClusterModel:
    """
    Make a cluster model. This is a JSON-serializable representation
    of the information about a cluster that can be sent over the wire.

    Parameters
    ----------
    cluster_id: string
        A unique string for the cluster.

    cluster_name: string
        A display name for the cluster.

    cluster: Cluster
        The cluster out of which to make the cluster model.

    adaptive: Adaptive
        The adaptive controller for the number of workers for the cluster, or
        none if the cluster is not scaled adaptively.
    """
    # This would be a great target for a dataclass
    # once python 3.7 is in wider use.
    scaling = "adaptive" if adaptive else "static"
    model = dict(
        id=cluster_id,
        name=cluster_name,
        scaling=scaling,
        scheduler_address=cluster.scheduler_address,
        dashboard_link=cluster.dashboard_link or "",
        workers=len(cluster.scheduler.workers),
        memory=utils.format_bytes(
            sum(ws.memory_limit for ws in cluster.scheduler.workers.values())
        ),
        cores=sum(ws.ncores for ws in cluster.scheduler.workers.values()),
    )
    if adaptive:
        model["maximum"] = adaptive.maximum
        model["minimum"] = adaptive.minimum

    return model


# Create a default cluster manager
# to keep track of clusters.
manager = DaskClusterManager()
