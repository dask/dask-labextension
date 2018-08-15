import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, InstanceTracker, MainAreaWidget } from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { find } from '@phosphor/algorithm';

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

  const tracker = new InstanceTracker<MainAreaWidget>({
    namespace: 'dask-dashboard'
  });

  const getItem = (
    widget: MainAreaWidget<IFrame>
  ): DaskDashboardLauncher.IItem => {
    const url = widget.content.url;
    const route = URLExt.parse(url).pathname!.slice(1);
    console.log(route);
    const item = find(dashboardLauncher.items, i => i.route === route)!;
    return item;
  };

  restorer.add(dashboardLauncher, 'running-sessions');
  restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => getItem(widget),
    name: widget => getItem(widget).route
  });

  app.shell.addToLeftArea(dashboardLauncher, { rank: 200 });

  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      const route = (args['route'] as string) || '';
      const iframe = new IFrame();
      iframe.url = `http://localhost:8787/${route}`;
      const widget = new MainAreaWidget({ content: iframe });
      widget.id = `dask-dashboard-${Private.id++}`;
      widget.title.label = `Dask ${(args['label'] as string) || ''}`;

      app.shell.addToMainArea(widget);
      tracker.add(widget);
    }
  });
}

namespace Private {
  /**
   * A private counter for ids.
   */
  export let id = 0;
}
