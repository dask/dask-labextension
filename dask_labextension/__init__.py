# Running `npm run build` will create static resources in the static
# directory of this Python package (and create that directory if necessary).


def _jupyter_labextension_paths():
    return [{
        'name': 'dask_labextension',
        'src': 'static',
    }]
