# dask-labextension

# Development installation

First build the npm package:

```
$ npm install
$ npm build
```

Then install the python package:

```
$ pip install -e .
```

Finally install and enable the labextension:

```
$ jupyter labextension install --py --symlink --sys-prefix dask_labextension
$ jupyter labextension enable --py dask_labextension
```

If changes are made to the npm package during development, just do the following
to update:

```
$ npm build
```
