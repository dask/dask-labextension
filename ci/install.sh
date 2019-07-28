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
  dask=2.1 \
  notebook

pip install git+https://github.com/dask/distributed@c291175a975dfb9376724ececba10fcc9e2e43c0
pip install -e .
