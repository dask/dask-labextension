import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, InstanceTracker, MainAreaWidget } from '@jupyterlab/apputils';

import { ISettingRegistry, IStateDB, URLExt } from '@jupyterlab/coreutils';

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
  requires: [ILayoutRestorer, ISettingRegistry, IStateDB],
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * Activate the dashboard launcher plugin.
 */
function activate(
  app: JupyterLab,
  restorer: ILayoutRestorer,
  settings: ISettingRegistry,
  state: IStateDB
): void {
  const id = 'dask-dashboard-launcher';
  const dashboardLauncher = new DaskDashboardLauncher({
    commands: app.commands
  });
  dashboardLauncher.id = id;
  dashboardLauncher.title.iconClass = 'dask-DaskLogo jp-SideBar-tabIcon';
  dashboardLauncher.title.caption = 'Dask Dashboard Launcher';

  const tracker = new InstanceTracker<MainAreaWidget<IFrame>>({
    namespace: 'dask-dashboard-launcher'
  });

  const argsForWidget = new Map<
    MainAreaWidget<IFrame>,
    DaskDashboardLauncher.IItem
  >();

  restorer.add(dashboardLauncher, id);
  restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => argsForWidget.get(widget)!,
    name: widget => argsForWidget.get(widget)!.route
  });

  app.shell.addToLeftArea(dashboardLauncher, { rank: 200 });

  dashboardLauncher.input.urlChanged.connect((sender, args) => {
    // Update the urls of open dashboards.
    tracker.forEach(widget => {
      if (!args.isValid) {
        widget.content.url = '';
        return;
      }
      const item = argsForWidget.get(widget)!;
      const url = URLExt.join(args.newValue, item.route);
      widget.content.url = url;
    });
    // Save the current url to the state DB so it can be
    // reloaded on refresh.
    state.save(id, { url: args.newValue });
  });

  // Fetch the initial state of the settings.
  Promise.all([
    settings.load('jupyterlab-dask:plugin'),
    state.fetch(id),
    app.restored
  ]).then(res => {
    const settings = res[0];
    const url = (res[1] as { url: string }).url as string;
    if (url) {
      // If there is a URL in the statedb, let it have priority.
      dashboardLauncher.input.url = url;
      return;
    }
    // Otherwise set the default from the settings.
    dashboardLauncher.input.url = settings.get('defaultURL')
      .composite as string;
  });

  // Add the command for launching a new dashboard item.
  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      // Construct the url for the dashboard.
      const valid = dashboardLauncher.input.isValid;
      const baseUrl = dashboardLauncher.input.url;
      const route = (args['route'] as string) || '';
      const url = valid ? URLExt.join(baseUrl, route) : '';

      // If we already have a dashboard open to this url, activate it
      // but don't create a duplicate.
      const w = tracker.find(w => {
        let item = argsForWidget.get(w);
        return !!item && item.route === route;
      });
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

      argsForWidget.set(widget, args as DaskDashboardLauncher.IItem);
      widget.disposed.connect(() => {
        argsForWidget.delete(widget);
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
