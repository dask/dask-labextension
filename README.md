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
Options for how to launch these clusters are set via the dask configuration system.

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
