import dask
from dask_labextension.manager import DaskClusterManager
from distributed.utils_test import gen_test


@gen_test()
async def test_core():
    with dask.config.set({'labextension.defaults.kwargs': {'processes': False},  # for speed
                          'labextension.initial': []}):
        async with DaskClusterManager() as manager:

            # add cluster
            model = await manager.start_cluster(
                    configuration={'adapt': {'minimum': 1, 'maximum': 3}}
            )
            assert model['adapt'] == {'minimum': 1, 'maximum': 3}

            # close cluster
            assert len(manager._clusters) == 1
            model2 = await manager.close_cluster(model['id'])
            assert not manager._clusters

            await manager.close()
