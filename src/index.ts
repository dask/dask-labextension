import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, InstanceTracker, MainAreaWidget } from '@jupyterlab/apputils';

import { DaskDashboardLauncher } from './widget';

import '../style/index.css';

namespace CommandIDs {
  /**
   * Launch a dask dashboard panel in an iframe.
   */
  export const launchPanel = 'dask:launch-dashboard';
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
  const dashboardLauncher = new DaskDashboardLauncher({
    commands: app.commands
  });
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
      const type = (args['route'] as string) || '';
      const iframe = new IFrame();
      iframe.url = `http://localhost:8787/${type}`;
      const widget = new MainAreaWidget({ content: iframe });
      widget.id = `dask-dashboard-${Private.id++}`;
      widget.title.label = `Dask ${(args['label'] as string) || ''}`;
      app.shell.addToMainArea(widget);
    }
  });
}

namespace Private {
  /**
   * A private counter for ids.
   */
  export let id = 0;
}
