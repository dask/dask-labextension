# dask_labextension

dask_labextension

## Prerequisites

- JupyterLab 0.11.2 or later

## Installation

To install using pip:

```bash
pip install dask_labextension
jupyter labextension install dask_labextension
jupyter labextension enable dask_labextension
```

## Development

As described in the [JupyterLab documentation](https://jupyterlab.readthedocs.io/en/stable/developer/extension_dev.html#extension-authoring) for a development install you can run the following in this directory:

```bash
npm install   # install npm package dependencies
npm run build  # optional build step if using TypeScript, babel, etc.
jupyter labextension install  # install the current directory as an extension
```

To rebuild the extension bundle:

```bash
npm run build
```
