#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
source /home/travis/.bashrc
conda activate test-environment

python -m pytest dask_labextension
