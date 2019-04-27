from __future__ import print_function, division, absolute_import

import os

import dask
import yaml


fn = os.path.join(os.path.dirname(__file__), "labextension.yaml")
dask.config.ensure_file(source=fn)

with open(fn) as f:
    defaults = yaml.safe_load(f)

dask.config.update_defaults(defaults)
