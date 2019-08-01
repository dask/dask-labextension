wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
bash miniconda.sh -b -p $HOME/miniconda
export PATH="$HOME/miniconda/bin:$PATH"
conda config --set always_yes yes --set changeps1 no
conda update -q conda

# Create conda environment
conda create -q -n test-environment python=$PYTHON
source activate test-environment
conda install -q \
  dask=2.1 \
  pytest=3.7 \
  notebook

# Install unreleased versions of dask and distributed for now
# in order to get a patched config system.

pip install -e .
