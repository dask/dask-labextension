import pytest

import dask
from distributed.utils_test import gen_test

from dask_labextension.manager import DaskClusterManager


@gen_test()
async def test_start():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:
            # add cluster
            model = await manager.start_cluster()
            assert not model.get('adapt')

            # close cluster
            assert len(manager.list_clusters()) == 1
            await manager.close_cluster(model['id'])

            # add cluster with adaptive configuration
            model = await manager.start_cluster(
                configuration={'adapt': {'minimum': 1, 'maximum': 3}}
            )
            assert model['adapt'] == {'minimum': 1, 'maximum': 3}

            await manager.close()

@gen_test()
async def test_close():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:
            # start a cluster
            model = await manager.start_cluster()

            # return None if a nonexistent cluster is closed
            assert not await manager.close_cluster('fake')

            # close the cluster
            await manager.close_cluster(model['id'])
            assert not manager.list_clusters()

@gen_test()
async def test_get():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:
            # start a cluster
            model = await manager.start_cluster()

            # return None if a nonexistent cluster is requested
            assert not manager.get_cluster('fake')

            # get the cluster by id
            assert model == manager.get_cluster(model['id'])

@pytest.mark.filterwarnings('ignore')
@gen_test()
async def test_list():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:
            # start with an empty list
            assert not manager.list_clusters()
            # start clusters
            model1 = await manager.start_cluster()
            model2 = await manager.start_cluster()

            models = manager.list_clusters()
            assert len(models) == 2
            assert model1 in models
            assert model2 in models

@gen_test()
async def test_scale():
    with dask.config.set({
        'labextension.defaults.kwargs': {'processes': False},  # for speed
        'labextension.initial': [],
    }):
        async with DaskClusterManager() as manager:
            # TODO: We would like to be able to await
            # scaling and adapting of a cluster. As it is,
            # it is more of a fire-and-forget operation,
            # so we can't reliably test this functionality.
            pass
            # add cluster with number of workers configuration
            # model = await manager.start_cluster(configuration={'workers': 3})
            # assert model['workers'] == 3
            # assert not model.get('adapt')
            # scale the cluster
            # model = manager.scale_cluster(model['id'], 6)
            # assert model['workers'] == 6
            # assert not model.get('adapt')

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
