import dask
from distributed.utils_test import gen_test

from dask_labextension.manager import DaskClusterManager


@gen_test()
async def test_core():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:

            # add cluster
            model = await manager.start_cluster(
                configuration={'adapt': {'minimum': 1, 'maximum': 3}}
            )
            assert model['adapt'] == {'minimum': 1, 'maximum': 3}

            # close cluster
            assert len(manager.list_clusters()) == 1
            await manager.close_cluster(model['id'])
            assert not manager.list_clusters()

            await manager.close()


@gen_test()
async def test_initial():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [{'name': 'foo'}],
    }):
        async with DaskClusterManager() as manager:
            await manager.initialized
            clusters = manager.list_clusters()
            assert len(clusters) == 1
            assert clusters[0]["name"] == 'foo'
