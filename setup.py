#!/usr/bin/env python
# coding: utf-8

# Copyright (c) IPython Development Team.
# Distributed under the terms of the Modified BSD License.

from __future__ import print_function

# the name of the package
name = 'dask-labextension'

DESCRIPTION = 'JupyterLab extension for Dask'
LONG_DESCRIPTION = """
"""

#-----------------------------------------------------------------------------
# Minimal Python version sanity check
#-----------------------------------------------------------------------------

import sys
from distutils.core import setup

v = sys.version_info
if v[:2] < (2,7) or (v[0] >= 3 and v[:2] < (3,3)):
    error = "ERROR: %s requires Python version 2.7 or 3.3 or above." % name
    print(error, file=sys.stderr)
    sys.exit(1)

PY3 = (sys.version_info[0] >= 3)

#-----------------------------------------------------------------------------
# get on with it
#-----------------------------------------------------------------------------


if 'develop' in sys.argv or any(a.startswith('bdist') for a in sys.argv):
    import setuptools

setup_args = dict(
    name                 = 'dask-labextension',
    packages             = ['dask_labextension'],
    author               = 'Brian Granger and Matt Rocklin',
    author_email         = 'ellisonbg@gmail.com',
    include_package_data = True
)

if __name__ == '__main__':
    setup(**setup_args)
