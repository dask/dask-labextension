#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
conda activate test-environment

conda install -q \
  dask \
  pytest=3.7 \
  notebook

pip install -e .
