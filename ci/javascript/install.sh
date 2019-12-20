#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
conda activate test-environment

conda install jupyterlab nodejs
npm install mocha

jlpm install
