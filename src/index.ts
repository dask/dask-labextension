import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, InstanceTracker, MainAreaWidget } from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { DaskDashboardLauncher } from './widget';

import '../style/index.css';

namespace CommandIDs {
  /**
   * Launch a dask dashboard panel in an iframe.
   */
  export const launchPanel = 'dask:launch-dashboard';
}

/**
 * The dask dashboard extension.
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
  dashboardLauncher.title.iconClass = 'dask-DaskLogo jp-SideBar-tabIcon';
  dashboardLauncher.title.caption = 'Dask Dashboard';

  const tracker = new InstanceTracker<MainAreaWidget<IFrame>>({
    namespace: 'dask-dashboard-launcher'
  });

  const itemForWidget = new Map<
    MainAreaWidget<IFrame>,
    DaskDashboardLauncher.IItem
  >();

  restorer.add(dashboardLauncher, 'dask-dashboard-launcher');
  restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => itemForWidget.get(widget)!,
    name: widget => itemForWidget.get(widget)!.route
  });

  app.shell.addToLeftArea(dashboardLauncher, { rank: 200 });

  dashboardLauncher.input.urlChanged.connect((sender, args) => {
    tracker.forEach(widget => {
      const item = itemForWidget.get(widget)!;
      const url = URLExt.join(args.newValue, item.route);
      widget.content.url = url;
    });
  });

  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      // Construct the url for the dashboard.
      const route = (args['route'] as string) || '';
      const baseUrl = dashboardLauncher.input.url;
      const url = URLExt.join(baseUrl, route);

      // If we already have a dashboard open to this url, activate it
      // but don't create a duplicate.
      const w = tracker.find(w => w.content.url === url);
      if (w) {
        app.shell.activateById(w.id);
        return;
      }

      // Otherwise create the new dashboard widget.
      const iframe = new IFrame();
      iframe.url = url;
      const widget = new MainAreaWidget({ content: iframe });
      widget.id = `dask-dashboard-${Private.id++}`;
      widget.title.label = `Dask ${(args['label'] as string) || ''}`;
      widget.title.icon = 'dask-DaskLogo';

      itemForWidget.set(widget, args as DaskDashboardLauncher.IItem);
      widget.disposed.connect(() => {
        itemForWidget.delete(widget);
      });
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
