// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, MainAreaWidget } from '@jupyterlab/apputils';

import { Widget } from '@phosphor/widgets';

namespace CommandIDs {
  /**
   * Launch a dask dashboard panel in an iframe.
   */
  export const launchPanel = 'dask:launch-panel';
}

/**
 * The default running sessions extension.
 */
const plugin: JupyterLabPlugin<void> = {
  activate,
  id: 'jupyterlab-dask:plugin',
  requires: [ILayoutRestorer],
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * Activate the dashboard launcher plugin.
 */
function activate(app: JupyterLab, restorer: ILayoutRestorer): void {
  const dashboardLauncher = new Widget();
  dashboardLauncher.id = 'dask-dashboard-launcher';
  dashboardLauncher.title.label = 'Dask';

  restorer.add(dashboardLauncher, 'running-sessions');

  app.shell.addToLeftArea(dashboardLauncher, { rank: 200 });

  let capitalize = (str: string) =>
    str ? `${str[0].toUpperCase()}${str.slice(1)}` : '';

  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args =>
      `Launch Dask ${capitalize(args['type'] as string)} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      const type = (args['type'] as string) || '';
      const iframe = new IFrame();
      iframe.url = `http://localhost:8787/${type}`;
      const widget = new MainAreaWidget({ content: iframe });
      widget.id = `dask-dashboard-${Private.id++}`;
      app.shell.addToMainArea(widget);
    }
  });

  app.restored.then(() => {
    app.commands.execute(CommandIDs.launchPanel);
  });
}

namespace Private {
  /**
   * A private counter for ids.
   */
  export let id = 0;
}
