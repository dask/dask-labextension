"""
Setup module for the dask_labextension
"""
import setuptools
from setupbase import (create_cmdclass, ensure_python, find_packages, get_version)

data_files_spec = [
    (
        "etc/jupyter/jupyter_notebook_config.d",
        "jupyter-config/jupyter_notebook_config.d",
        "dask_labextension.json",
    )
]

package_data_spec = {"dask_labextension": ["*.yaml"]}


cmdclass = create_cmdclass(
    package_data_spec=package_data_spec, data_files_spec=data_files_spec
)

VERSION = get_version("dask_labextension/_version.py")

setup_dict = dict(
    name="dask_labextension",
    version=VERSION,
    description="A Jupyter Notebook server extension manages Dask clusters.",
    long_description="A Jupyter Notebook server extension manages Dask clusters. Meant to be used in conjunction with the dask-labextension JupyterLab extension.",
    packages=find_packages(),
    cmdclass=cmdclass,
    include_package_data=True,
    author="Jupyter Development Team",
    author_email="jupyter@googlegroups.com",
    url="http://jupyter.org",
    license="BSD",
    platforms="Linux, Mac OS X, Windows",
    keywords=["Jupyter", "JupyterLab", "Dask"],
    python_requires=">=3.5",
    classifiers=[
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3",
    ],
    install_requires=[
        "bokeh", "distributed>=1.24.1", "notebook>=4.3.1", "jupyter-server-proxy>=1.1.0"
    ],
)

try:
    ensure_python(setup_dict["python_requires"].split(","))
except ValueError as e:
    raise ValueError(
        "{:s}, to use {} you must use python {} ".format(
            e, setup_dict["name"], setup_dict["python_requires"]
        )
    )

setuptools.setup(**setup_dict)
