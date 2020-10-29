import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './handler';

/**
 * Initialization data for the dask-labextension extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: 'dask-labextension',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension dask-labextension is activated!');

    requestAPI<any>('get_example')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The dask_labextension server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default extension;
