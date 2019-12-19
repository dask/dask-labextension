#!/bin/bash

export PATH="$HOME/miniconda/bin:$PATH"
conda activate test-environment

jlpm build
jlpm test
