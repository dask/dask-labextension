import {
  ILayoutRestorer,
  JupyterLab,
  JupyterLabPlugin
} from '@jupyterlab/application';

import {
  IClientSession,
  IInstanceTracker,
  InstanceTracker
} from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { ISettingRegistry, IStateDB } from '@jupyterlab/coreutils';

import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel
} from '@jupyterlab/notebook';

import { Kernel, KernelMessage } from '@jupyterlab/services';

import { Signal } from '@phosphor/signaling';

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
    if (!Private.shouldUseKernel(kernel)) {
      return '';
    }
    // If so, find the link if we can.
    const link = await Private.checkKernel(kernel!);
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

  app.shell.addToLeftArea(sidebar, { rank: 200 });

  sidebar.dashboardLauncher.input.urlChanged.connect((sender, args) => {
    // Update the urls of open dashboards.
    tracker.forEach(widget => {
      if (!args.isValid) {
        widget.dashboardUrl = '';
        return;
      }
      widget.dashboardUrl = args.newValue;
    });
    // Save the current url to the state DB so it can be
    // reloaded on refresh.
    state.save(id, { url: args.newValue });
  });

  // A function to create a new dask client for a session.
  const createClientForSession = (session: IClientSession) => {
    const cluster = sidebar.clusterManager.activeCluster;
    if (!cluster || !Private.shouldUseKernel(session.kernel)) {
      return;
    }
    Private.createClientForKernel(cluster, session.kernel!);
  };

  type SessionOwner = NotebookPanel | ConsolePanel;
  // An array of the trackers to check for active sessions.
  const trackers: IInstanceTracker<SessionOwner>[] = [
    notebookTracker,
    consoleTracker
  ];

  // A function to recreate a dask client on reconnect.
  const injectOnSessionStatusChanged = (session: IClientSession) => {
    if (session.status === 'connected') {
      createClientForSession(session);
    }
  };

  // A function to inject a dask client when a new session owner is added.
  const injectOnWidgetAdded = (
    sender: IInstanceTracker<SessionOwner>,
    widget: SessionOwner
  ) => {
    widget.session.statusChanged.connect(injectOnSessionStatusChanged);
  };

  // A function to inject a dask client when the active cluster changes.
  const injectOnClusterChanged = () => {
    trackers.forEach(tracker => {
      tracker.forEach(widget => {
        const session = widget.session;
        if (Private.shouldUseKernel(session.kernel)) {
          createClientForSession(session);
        }
      });
    });
  };

  // Whether the dask cluster clients should aggressively inject themselves
  // into the current session.
  let greedyClusterClient: boolean = false;

  // Update the existing trackers and signals in light of a change to the
  // settings system. In particular, this reacts to a change in the setting
  // for the greedy cluster client.
  const updateTrackers = () => {
    // Clear any existing signals related to the greedy cluster client.
    Signal.clearData(injectOnWidgetAdded);
    Signal.clearData(injectOnSessionStatusChanged);
    Signal.clearData(injectOnClusterChanged);

    if (greedyClusterClient) {
      // When a new console or notebook is created, inject
      // a new client into it.
      trackers.forEach(tracker => {
        tracker.widgetAdded.connect(injectOnWidgetAdded);
      });

      // When the status of an existing notebook changes, reinject the client.
      trackers.forEach(tracker => {
        tracker.forEach(widget => {
          createClientForSession(widget.session);
          widget.session.statusChanged.connect(injectOnSessionStatusChanged);
        });
      });

      // When the active cluster changes, reinject the client.
      sidebar.clusterManager.activeClusterChanged.connect(
        injectOnClusterChanged
      );
    }
  };

  // Fetch the initial state of the settings.
  Promise.all([settings.load(PLUGIN_ID), state.fetch(id), app.restored]).then(
    res => {
      const settings = res[0];
      const url = (res[1] as { url: string }).url as string;
      if (url) {
        // If there is a URL in the statedb, let it have priority.
        sidebar.dashboardLauncher.input.url = url;
      } else {
        // Otherwise set the default from the settings.
        sidebar.dashboardLauncher.input.url = settings.get('defaultURL')
          .composite as string;
      }

      const onSettingsChanged = () => {
        // Determine whether to use the greedy cluster client.
        greedyClusterClient = settings.get('greedyClusterClient')
          .composite as boolean;
        updateTrackers();
      };
      onSettingsChanged();
      // React to a change in the settings.
      settings.changed.connect(onSettingsChanged);
    }
  );

  // Add the command for launching a new dashboard item.
  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      // Construct the url for the dashboard.
      const dashboardUrl = sidebar.dashboardLauncher.input.url;
      const dashboardItem = args as IDashboardItem;

      // If we already have a dashboard open to this url, activate it
      // but don't create a duplicate.
      const w = tracker.find(w => {
        return !!(w && w.item && w.item.route === dashboardItem.route);
      });
      if (w) {
        app.shell.activateById(w.id);
        return;
      }

      // Otherwise create the new dashboard widget.
      const dashboard = new DaskDashboard();
      dashboard.dashboardUrl = dashboardUrl;
      dashboard.item = dashboardItem;
      dashboard.id = `dask-dashboard-${Private.id++}`;
      dashboard.title.label = `Dask ${dashboardItem.label}`;
      dashboard.title.icon = 'dask-DaskLogo';

      app.shell.addToMainArea(dashboard);
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
   * Whether a kernel should be used. Only evaluates to true
   * if it is valid and in python.
   */
  export function shouldUseKernel(
    kernel: Kernel.IKernelConnection | null | undefined
  ): boolean {
    return (
      !!kernel && !!kernel.info && kernel.info.language_info.name === 'python'
    );
  }

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
   * Connect a kernel to a cluster by creating a new Client.
   */
  export function createClientForKernel(
    model: IClusterModel,
    kernel: Kernel.IKernelConnection
  ): Promise<string> {
    const code = `import dask; from dask.distributed import Client
dask.config.set({'scheduler-address': '${model.scheduler_address}'})
client = Client()`;
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
        resolve(void 0);
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
   * In the case of a notebook, it creates a new cell above the currently
   * active cell and then returns that.
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
