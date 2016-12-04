# dask_labextension

dask_labextension


## Prerequisites

* JupyterLab 0.11.2 or later

## Installation

To install using pip:

```bash
pip install dask_labextension
jupyter labextension install --py --sys-prefix dask_labextension
jupyter labextension enable --py --sys-prefix dask_labextension
```

## Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
pip install -e .
jupyter labextension install --symlink --py --sys-prefix dask_labextension
jupyter labextension enable --py --sys-prefix dask_labextension
```

To rebuild the extension bundle:

```bash
npm run build
```

