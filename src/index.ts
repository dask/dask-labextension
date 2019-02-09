import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { InstanceTracker } from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { ISettingRegistry, IStateDB } from '@jupyterlab/coreutils';

import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel
} from '@jupyterlab/notebook';

import { Kernel, KernelMessage } from '@jupyterlab/services';

import { IClusterModel, DaskClusterManager } from './clusters';

import { DaskDashboard, IDashboardItem } from './dashboard';

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

  /**
   * Launch a new cluster.
   */
  export const launchCluster = 'dask:launch-cluster';

  /**
   * Shutdown a cluster.
   */
  export const stopCluster = 'dask:stop-cluster';

  /**
   * Scale a cluster.
   */
  export const scaleCluster = 'dask:scale-cluster';
}

const PLUGIN_ID = 'dask-labextension:plugin';

/**
 * The dask dashboard extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  activate,
  id: PLUGIN_ID,
  requires: [
    IConsoleTracker,
    ILabShell,
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
  app: JupyterFrontEnd,
  consoleTracker: IConsoleTracker,
  labShell: ILabShell,
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
      labShell,
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

  const clientCodeInjector = (model: IClusterModel) => {
    const editor = Private.getCurrentEditor(
      app,
      notebookTracker,
      consoleTracker
    );
    if (!editor) {
      return;
    }
    Private.injectClientCode(model, editor);
  };

  // Create the Dask sidebar panel.
  const sidebar = new DaskSidebar({
    launchDashboardItem: (item: IDashboardItem) => {
      app.commands.execute(CommandIDs.launchPanel, item);
    },
    linkFinder,
    clientCodeInjector
  });
  sidebar.id = id;
  sidebar.title.iconClass = 'dask-DaskLogo jp-SideBar-tabIcon';
  sidebar.title.caption = 'Dask';

  // An instance tracker which is used for state restoration.
  const tracker = new InstanceTracker<DaskDashboard>({
    namespace: 'dask-dashboard-launcher'
  });

  // Add state restoration for the dashboard items.
  restorer.add(sidebar, id);
  restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => widget.item,
    name: widget => widget.item && widget.item.route
  });

  labShell.add(sidebar, 'left', { rank: 200 });

  const updateDashboards = () => {
    const input = sidebar.dashboardLauncher.input;
    // Update the urls of open dashboards.
    tracker.forEach(widget => {
      if (!input.isValid) {
        widget.dashboardUrl = '';
        widget.active = false;
        return;
      }
      widget.dashboardUrl = input.url;
      widget.active = true;
    });
  };

  sidebar.dashboardLauncher.input.urlChanged.connect((sender, args) => {
    updateDashboards();
    // Save the current url to the state DB so it can be
    // reloaded on refresh.
    state.save(id, { url: args.newValue });
  });
  updateDashboards();

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
      const dashboardUrl = sidebar.dashboardLauncher.input.url;
      const active = sidebar.dashboardLauncher.input.isValid;
      const dashboardItem = args as IDashboardItem;

      // If we already have a dashboard open to this url, activate it
      // but don't create a duplicate.
      const w = tracker.find(w => {
        return !!(w && w.item && w.item.route === dashboardItem.route);
      });
      if (w) {
        labShell.activateById(w.id);
        return;
      }

      // Otherwise create the new dashboard widget.
      const dashboard = new DaskDashboard();
      dashboard.dashboardUrl = dashboardUrl;
      dashboard.item = dashboardItem;
      dashboard.active = active;
      dashboard.id = `dask-dashboard-${Private.id++}`;
      dashboard.title.label = `Dask ${dashboardItem.label}`;
      dashboard.title.icon = 'dask-DaskLogo';

      labShell.add(dashboard, 'main');
      tracker.add(dashboard);
      return dashboard;
    }
  });

  // Add a command to inject client connection code for a given cluster model.
  // This looks for a cluster model in the application context menu,
  // and looks for an editor among the currently active notebooks and consoles.
  // If either is not found, it bails.
  app.commands.addCommand(CommandIDs.injectClientCode, {
    label: 'Inject Dask Client Connection Code',
    execute: () => {
      const cluster = Private.clusterFromClick(app, sidebar.clusterManager);
      if (!cluster) {
        return;
      }
      clientCodeInjector(cluster);
    }
  });

  // Add a command to launch a new cluster.
  app.commands.addCommand(CommandIDs.launchCluster, {
    label: 'Launch New Cluster',
    execute: () => {
      return sidebar.clusterManager.start();
    }
  });

  // Add a command to launch a new cluster.
  app.commands.addCommand(CommandIDs.stopCluster, {
    label: 'Shutdown Cluster',
    execute: () => {
      const cluster = Private.clusterFromClick(app, sidebar.clusterManager);
      if (!cluster) {
        return;
      }
      return sidebar.clusterManager.stop(cluster.id);
    }
  });

  // Add a command to launch a new cluster.
  app.commands.addCommand(CommandIDs.scaleCluster, {
    label: 'Scale Cluster…',
    execute: () => {
      const cluster = Private.clusterFromClick(app, sidebar.clusterManager);
      if (!cluster) {
        return;
      }
      return sidebar.clusterManager.scale(cluster.id);
    }
  });

  // Add a context menu items.
  app.contextMenu.addItem({
    command: CommandIDs.injectClientCode,
    selector: '.dask-ClusterListingItem',
    rank: 10
  });
  app.contextMenu.addItem({
    command: CommandIDs.stopCluster,
    selector: '.dask-ClusterListingItem',
    rank: 3
  });
  app.contextMenu.addItem({
    command: CommandIDs.scaleCluster,
    selector: '.dask-ClusterListingItem',
    rank: 2
  });
  app.contextMenu.addItem({
    command: CommandIDs.launchCluster,
    selector: '.dask-ClusterListing-list',
    rank: 1
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
client`;
    editor.model.value.insert(offset, code);
  }

  /**
   * Get the currently focused kernel in the application,
   * checking both notebooks and consoles.
   */
  export function getCurrentKernel(
    shell: ILabShell,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker
  ): Kernel.IKernelConnection | null | undefined {
    // Get a handle on the most relevant kernel,
    // whether it is attached to a notebook or a console.
    let current = shell.currentWidget;
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
   * In the case of a notebook, it creates a new cell above the currently
   * active cell and then returns that.
   */
  export function getCurrentEditor(
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker
  ): CodeEditor.IEditor | null | undefined {
    // Get a handle on the most relevant kernel,
    // whether it is attached to a notebook or a console.
    let current = app.shell.currentWidget;
    let editor: CodeEditor.IEditor | null | undefined;
    if (current && notebookTracker.has(current)) {
      NotebookActions.insertAbove((current as NotebookPanel).content);
      const cell = (current as NotebookPanel).content.activeCell;
      editor = cell && cell.editor;
    } else if (current && consoleTracker.has(current)) {
      const cell = (current as ConsolePanel).console.promptCell;
      editor = cell && cell.editor;
    } else if (notebookTracker.currentWidget) {
      const current = notebookTracker.currentWidget;
      NotebookActions.insertAbove(current.content);
      const cell = current.content.activeCell;
      editor = cell && cell.editor;
    } else if (consoleTracker.currentWidget) {
      const current = consoleTracker.currentWidget;
      const cell = current.console.promptCell;
      editor = cell && cell.editor;
    }
    return editor;
  }

  /**
   * Get a cluster model based on the application context menu click node.
   */
  export function clusterFromClick(
    app: JupyterFrontEnd,
    manager: DaskClusterManager
  ): IClusterModel | undefined {
    const test = (node: HTMLElement) => !!node.dataset.clusterId;
    const node = app.contextMenuHitTest(test);
    if (!node) {
      return undefined;
    }
    const id = node.dataset.clusterId;

    return manager.clusters.find(cluster => cluster.id === id);
  }
}
