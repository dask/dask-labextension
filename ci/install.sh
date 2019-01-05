wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh
bash miniconda.sh -b -p $HOME/miniconda
export PATH="$HOME/miniconda/bin:$PATH"
conda config --set always_yes yes --set changeps1 no
conda update -q conda

# Create conda environment
conda create -q -n test-environment python=$PYTHON
source activate test-environment
conda install -q \
  pytest=3.7 \
  notebook

# Install unreleased versions of dask and distributed for now
# in order to get a patched config system.
pip install git+https://github.com/dask/dask.git@677d62a35bae0fb964472b604bc52ef91b46ea22
pip install git+https://github.com/dask/distributed.git@538767b4977d1bd14679ae555b7705088a7e5a16

pip install -e .
