# Dask JupyterLab Extension

This package provides a JupyterLab extension to embed Dask's dashboard plots
directly into JupyterLab panes.

## Installation

Install using the command line with

```bash
jupyter labextension install dask_labextension
```

### For development

As described in the [JupyterLab documentation](https://jupyterlab.readthedocs.io/en/stable/developer/extension_dev.html#extension-authoring) for a development install you can run the following in this directory:

```bash
npm install   # Install npm package dependencies
npm run build  # Compile the TypeScript sources to Javascript
jupyter labextension install  # Install the current directory as an extension
```

To rebuild the extension bundle:

```bash
npm run build
```
