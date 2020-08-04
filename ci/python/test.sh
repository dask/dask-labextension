#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
conda activate test-environment

python -m pytest dask_labextension
