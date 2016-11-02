var buildExtension = require('@jupyterlab/extension-builder').buildExtension;

buildExtension({
        name: 'dask-labextension',
        entry: './lib/plugin.js',
        outputDir: './dask_labextension/static'
});
