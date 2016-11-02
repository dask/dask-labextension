import {
  JupyterLab, JupyterLabPlugin
} from 'jupyterlab/lib/application';

import {
  ICommandPalette
} from 'jupyterlab/lib/commandpalette';

import {
  DistributedUIElement
} from './widget'

const URL = '127.0.0.1'
const PORT = '8787'

const SCRIPTS = [
  {
    src: `http://${URL}:${PORT}/resource-profiles/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9680`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9680",
    id: "distributed-ui:bk-resource-profiles-plot",
    text: "Resource Profiles",
    "data-bokeh-model-id": "bk-resource-profiles-plot",
    "data-bokeh-doc-id": ""
  },
  {
    src: `http://${URL}:${PORT}/memory-usage/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9682`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9682",
    id: "distributed-ui:bk-nbytes-plot",
    text: "Memory Use",
    'data-bokeh-model-id': "bk-nbytes-plot",
    'data-bokeh-doc-id': ""
  },
  {
    src: `http://${URL}:${PORT}/task-stream/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9683`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9683",
    id: "distributed-ui:bk-task-stream-plot",
    text: "Task Stream",
    'data-bokeh-model-id': "bk-task-stream-plot",
    'data-bokeh-doc-id': ""
  },
  {
    src: `http://${URL}:${PORT}/task-progress/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9684`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9684",
    id: "distributed-ui:bk-task-progress-plot",
    text: "Task Progress",
    'data-bokeh-model-id': "bk-task-progress-plot",
    'data-bokeh-doc-id': ""
  },
  {
    src: `http://${URL}:${PORT}/processing-stacks/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9685`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9685",
    id: "distributed-ui:bk-processing-stacks-plot",
    text: "Processing and Stacks",
    'data-bokeh-model-id': "bk-processing-stacks-plot",
    'data-bokeh-doc-id': ""
  },
  {
    src: `http://${URL}:${PORT}/worker-table/autoload.js?bokeh-autoload-element=0938e7ff-da78-4769-bf7f-b31d99fd9687`,
    bokeh_id: "0938e7ff-da78-4769-bf7f-b31d99fd9687",
    id: "distributed-ui:bk-worker-table",
    text: "Workers Table",
    'data-bokeh-model-id': "bk-worker-table",
    'data-bokeh-doc-id': ""
  }
];

/**
 * A namespace for help plugin private functions.
 */
const distributedUILab: JupyterLabPlugin<void> = {
  id: 'jupyter.extensions.dask-labextension',
  requires: [ICommandPalette],
  activate: activateDistributedUILab,
  autoStart: true
}

export default distributedUILab;

/**
 * Activate the bokeh application extension.
 */
function activateDistributedUILab(app: JupyterLab, palette: ICommandPalette): void {

  let elements: Array<DistributedUIElement> = [];

  for (let script of SCRIPTS) {
    elements.push(new DistributedUIElement(script))
  }

  // Register commands for each DistributedUIElement
  elements.forEach(element => app.commands.addCommand(element.id, {
    label: element.title.label,
    execute: () => {
      app.shell.addToMainArea(element)
    }
  }))

  // Add a palette element for each DistributedUIElement command
  elements.forEach(element => palette.addItem({
    command: element.id,
    category: "Dask Distributed UI"
  }))
}
