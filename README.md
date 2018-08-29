# Dask JupyterLab Extension

This package provides a JupyterLab extension to embed Dask's dashboard plots
directly into JupyterLab panes.

## Installation

### With pip

```bash
pip install dask_labextension
jupyter labextension install dask_labextension
```

### For development

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
