"""
dask_labextension setup
"""
import json
import os

from jupyter_packaging import (
    create_cmdclass, install_npm, ensure_targets,
    combine_commands, get_version,
)
import setuptools

HERE = os.path.abspath(os.path.dirname(__file__))

# The name of the project
name="dask_labextension"

# Get our version
with open(os.path.join(HERE, 'package.json')) as f:
    version = json.load(f)['version']

lab_path = os.path.join(HERE, name, "labextension")

# Representative files that should exist after a successful build
jstargets = [
    os.path.join(HERE, "lib", "index.js"),
    os.path.join(lab_path, "package.json"),
]

package_data_spec = {
    name: [
        "*"
    ]
}

labext_name = "dask-labextension"

data_files_spec = [
    ("share/jupyter/labextensions/%s" % labext_name, lab_path, "**"),
    ("share/jupyter/labextensions/%s" % labext_name, HERE, "install.json"),("etc/jupyter/jupyter_server_config.d",
     "jupyter-config", "dask_labextension.json"),
]

cmdclass = create_cmdclass("jsdeps",
    package_data_spec=package_data_spec,
    data_files_spec=data_files_spec
)

cmdclass["jsdeps"] = combine_commands(
    install_npm(HERE, build_cmd="build:prod", npm=["jlpm"]),
    ensure_targets(jstargets),
)

with open("README.md", "r") as fh:
    long_description = fh.read()

setup_args = dict(
    name=name,
    version=version,
    url="y",
    author="Ian Rose, Matt Rocklin, Jacob Tomlinson",
    description="A JupyterLab extension for Dask.",
    long_description= long_description,
    long_description_content_type="text/markdown",
    cmdclass= cmdclass,
    packages=setuptools.find_packages(),
    install_requires=[
        "bokeh >=1.0.0,!=2.0.0",
        "distributed>=1.24.1",
        "jupyter-server-proxy>=1.3.2",
        "jupyterlab>=3.0.0rc2,==3.*",
        "notebook>=4.3.1",
    ],
    zip_safe=False,
    include_package_data=True,
    python_requires=">=3.6",
    license="BSD-3-Clause",
    platforms="Linux, Mac OS X, Windows",
    keywords=["Jupyter", "JupyterLab", "JupyterLab3"],
    classifiers=[
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Framework :: Jupyter",
    ],
)


if __name__ == "__main__":
    setuptools.setup(**setup_args)
