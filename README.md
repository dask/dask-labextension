# Dask JupyterLab Extension

[![Build Status](https://travis-ci.org/dask/dask-labextension.svg?branch=master)](https://travis-ci.org/dask/dask-labextension) [![Version](https://img.shields.io/npm/v/dask-labextension.svg)](https://www.npmjs.com/package/dask-labextension) [![Downloads](https://img.shields.io/npm/dm/dask-labextension.svg)](https://www.npmjs.com/package/dask-labextension) [![Dependencies](https://img.shields.io/librariesio/release/npm/dask-labextension.svg)](https://libraries.io/npm/dask-labextension)

This package provides a JupyterLab extension to manage Dask clusters,
as well as embed Dask's dashboard plots directly into JupyterLab panes.

![Dask Extension](./dask.png)

## Requirements

JupyterLab >= 1.0
distributed >= 1.24.1

## Installation

This extension includes both a client-side JupyterLab extension and a server-side
Jupyter notebook extension. Install these using the command line with

```bash
pip install dask_labextension
jupyter labextension install dask-labextension
```

If you are running Notebook 5.2 or earlier, enable the server extension by running

```bash
jupyter serverextension enable --py --sys-prefix dask_labextension
```

## Configuration of Dask cluster management

This extension has the ability to launch and manage several kinds of Dask clusters,
including local clusters and kubernetes clusters.
Options for how to launch these clusters are set via the
[dask configuration system](http://docs.dask.org/en/latest/configuration.html#configuration),
typically a `.yml` file on disk.

By default the extension launches a `LocalCluster`, for which the configuration is:

```yaml
labextension:
  factory:
    module: 'dask.distributed'
    class: 'LocalCluster'
    args: []
    kwargs: {}
  default:
    workers: null
    adapt:
      null
      # minimum: 0
      # maximum: 10
  initial:
    []
    # - name: "My Big Cluster"
    #   workers: 100
    # - name: "Adaptive Cluster"
    #   adapt:
    #     minimum: 0
    #     maximum: 50
```

In this configuration, `factory` gives the module, class name, and arguments needed to create the cluster.
The `default` key describes the initial number of workers for the cluster, as well as whether it is adaptive.
The `initial` key gives a list of initial clusters to start upon launch of the notebook server.

In addition to `LocalCluster`, this extension has been used to launch several other Dask cluster
objects, a few examples of which are:

- A SLURM cluster, using

```yaml
labextension:
    factory:
      module: 'dask_jobqueue'
       class: 'SLURMCluster'
       args: []
       kwargs: {}
```

- A PBS cluster, using

```yaml
labextension:
  factory:
    module: 'dask_jobqueue'
    class: 'PBSCluster'
    args: []
    kwargs: {}
```

- A [Kubernetes cluster](https://github.com/pangeo-data/pangeo-cloud-federation/blob/8f7f4bf9963ef1ed180dd20c952ff1aa8df54ca2/deployments/ocean/image/binder/dask_config.yaml#L37-L42), using

```yaml
labextension:
  factory:
    module: dask_kubernetes
    class: KubeCluster
    args: []
    kwargs: {}
```

### Development install

As described in the [JupyterLab documentation](https://jupyterlab.readthedocs.io/en/stable/developer/extension_dev.html#extension-authoring) for a development install of the labextension you can run the following in this directory:

```bash
jlpm install   # Install npm package dependencies
jlpm run build  # Compile the TypeScript sources to Javascript
jupyter labextension install  # Install the current directory as an extension
```

To rebuild the extension:

```bash
jlpm run build
```

If you run JupyterLab in watch mode (`jupyter lab --watch`) it will automatically pick
up changes to the built extension and rebundle itself.

To run an editable install of the server extension, run

```bash
pip install -e .
jupyter serverextension enable --sys-prefix dask_labextension
```
