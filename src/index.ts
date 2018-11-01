import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import { IFrame, InstanceTracker, MainAreaWidget } from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { ISettingRegistry, IStateDB, URLExt } from '@jupyterlab/coreutils';

import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';

import { Kernel, KernelMessage } from '@jupyterlab/services';

import { IClusterModel, DaskClusterManager } from './clusters';

import { IDashboardItem, normalizeDashboardUrl } from './dashboard';

import { DaskSidebar } from './sidebar';

import '../style/index.css';

namespace CommandIDs {
  /**
   * Launch a dask dashboard panel in an iframe.
   */
  export const launchPanel = 'dask:launch-dashboard';

  /**
   * Inject client code into the active editor.
   */
  export const injectClientCode = 'dask:inject-client-code';
}

const PLUGIN_ID = 'dask-labextension:plugin';

/**
 * The dask dashboard extension.
 */
const plugin: JupyterLabPlugin<void> = {
  activate,
  id: PLUGIN_ID,
  requires: [
    IConsoleTracker,
    ILayoutRestorer,
    INotebookTracker,
    ISettingRegistry,
    IStateDB
  ],
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
  consoleTracker: IConsoleTracker,
  restorer: ILayoutRestorer,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry,
  state: IStateDB
): void {
  const id = 'dask-dashboard-launcher';

  // Attempt to find a link to the dask dashboard
  // based on the currently active notebook/console
  const linkFinder = async () => {
    const kernel = Private.getCurrentKernel(
      app,
      notebookTracker,
      consoleTracker
    );
    // Check to see if we found a kernel, and if its
    // language is python.
    if (
      !kernel ||
      !kernel.info ||
      kernel.info.language_info.name !== 'python'
    ) {
      return '';
    }
    // If so, find the link if we can.
    const link = await Private.checkKernel(kernel);
    return link;
  };

  const sidebar = new DaskSidebar({
    launchDashboardItem: (item: IDashboardItem) => {
      app.commands.execute(CommandIDs.launchPanel, item);
    },
    linkFinder
  });
  sidebar.id = id;
  sidebar.title.iconClass = 'dask-DaskLogo jp-SideBar-tabIcon';
  sidebar.title.caption = 'Dask';

  const tracker = new InstanceTracker<MainAreaWidget<IFrame>>({
    namespace: 'dask-dashboard-launcher'
  });

  const argsForWidget = new Map<MainAreaWidget<IFrame>, IDashboardItem>();

  restorer.add(sidebar, id);
  restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => argsForWidget.get(widget)!,
    name: widget => argsForWidget.get(widget)!.route
  });

  app.shell.addToLeftArea(sidebar, { rank: 200 });

  sidebar.dashboardLauncher.input.urlChanged.connect((sender, args) => {
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
  Promise.all([settings.load(PLUGIN_ID), state.fetch(id), app.restored]).then(
    res => {
      const settings = res[0];
      const url = (res[1] as { url: string }).url as string;
      if (url) {
        // If there is a URL in the statedb, let it have priority.
        sidebar.dashboardLauncher.input.url = url;
        return;
      }
      // Otherwise set the default from the settings.
      sidebar.dashboardLauncher.input.url = settings.get('defaultURL')
        .composite as string;
    }
  );

  // Add the command for launching a new dashboard item.
  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      // Construct the url for the dashboard.
      const valid = sidebar.dashboardLauncher.input.isValid;
      const baseUrl = normalizeDashboardUrl(
        sidebar.dashboardLauncher.input.url
      );
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

      argsForWidget.set(widget, args as IDashboardItem);
      widget.disposed.connect(() => {
        argsForWidget.delete(widget);
      });
      app.shell.addToMainArea(widget);
      tracker.add(widget);
    }
  });

  app.commands.addCommand(CommandIDs.injectClientCode, {
    label: 'Inject Dask Client Connection Code',
    execute: args => {
      const cluster = Private.clusterFromClick(app, sidebar.clusterManager);
      const editor = Private.getCurrentEditor(
        app,
        notebookTracker,
        consoleTracker
      );
      if (!editor || !cluster) {
        return;
      }
      Private.injectClientCode(cluster, editor);
    }
  });

  app.contextMenu.addItem({
    command: CommandIDs.injectClientCode,
    selector: '.dask-ClusterListingItem-label'
  });
}

namespace Private {
  /**
   * A private counter for ids.
   */
  export let id = 0;

  /**
   * Check a kernel for whether it has a default client dashboard address.
   */
  export function checkKernel(
    kernel: Kernel.IKernelConnection
  ): Promise<string> {
    const code = `try:\n  from dask.distributed import default_client as _internal_jlab_default_client\n  display(_internal_jlab_default_client().cluster.dashboard_link)\nexcept:\n  pass`;
    const content: KernelMessage.IExecuteRequest = {
      store_history: false,
      code
    };
    return new Promise<string>((resolve, reject) => {
      const future = kernel.requestExecute(content);
      future.onIOPub = msg => {
        if (msg.header.msg_type !== 'display_data') {
          return;
        }
        const data = (msg as KernelMessage.IDisplayDataMsg).content.data;
        const url = (data['text/plain'] as string) || '';
        console.log(`Found dashboard link at ${url}`);
        resolve(url.replace(/'/g, '').split('status')[0]);
      };
    });
  }

  /**
   * Insert code to connect to a given cluster.
   */
  export function injectClientCode(
    cluster: IClusterModel,
    editor: CodeEditor.IEditor
  ): void {
    const cursor = editor.getCursorPosition();
    const offset = editor.getOffsetAt(cursor);
    const code = `from dask.distributed import Client

client = Client("${cluster.scheduler_address}")
client
`;
    editor.model.value.insert(offset, code);
  }

  /**
   * Get the currently focused kernel in the application,
   * checking both notebooks and consoles.
   */
  export function getCurrentKernel(
    app: JupyterLab,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker
  ): Kernel.IKernelConnection | null | undefined {
    // Get a handle on the most relevant kernel,
    // whether it is attached to a notebook or a console.
    let current = app.shell.currentWidget;
    let kernel: Kernel.IKernelConnection | null | undefined;
    if (current && notebookTracker.has(current)) {
      kernel = (current as NotebookPanel).session.kernel;
    } else if (current && consoleTracker.has(current)) {
      kernel = (current as ConsolePanel).session.kernel;
    } else if (notebookTracker.currentWidget) {
      const current = notebookTracker.currentWidget;
      kernel = current.session.kernel;
    } else if (consoleTracker.currentWidget) {
      const current = consoleTracker.currentWidget;
      kernel = current.session.kernel;
    }
    return kernel;
  }

  /**
   * Get the currently focused editor in the application,
   * checking both notebooks and consoles.
   */
  export function getCurrentEditor(
    app: JupyterLab,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker
  ): CodeEditor.IEditor | null | undefined {
    // Get a handle on the most relevant kernel,
    // whether it is attached to a notebook or a console.
    let current = app.shell.currentWidget;
    let editor: CodeEditor.IEditor | null | undefined;
    if (current && notebookTracker.has(current)) {
      const cell = (current as NotebookPanel).content.activeCell;
      editor = cell && cell.editor;
    } else if (current && consoleTracker.has(current)) {
      const cell = (current as ConsolePanel).console.promptCell;
      editor = cell && cell.editor;
    } else if (notebookTracker.currentWidget) {
      const current = notebookTracker.currentWidget;
      const cell = (current as NotebookPanel).content.activeCell;
      editor = cell && cell.editor;
    } else if (consoleTracker.currentWidget) {
      const current = consoleTracker.currentWidget;
      const cell = (current as ConsolePanel).console.promptCell;
      editor = cell && cell.editor;
    }
    return editor;
  }

  /**
   * Get a cluster model based on the application context menu click node.
   */
  export function clusterFromClick(
    app: JupyterLab,
    manager: DaskClusterManager
  ): IClusterModel | undefined {
    const test = (node: HTMLElement) => !!node.dataset.clusterId;
    const node = app.contextMenuFirst(test);
    if (!node) {
      return undefined;
    }
    const id = node.dataset.clusterId;

    return manager.clusters.find(cluster => cluster.id === id);
  }
}
