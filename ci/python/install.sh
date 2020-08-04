#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
conda activate test-environment

conda install -q \
  dask \
  pytest \
  notebook

pip install -e .
