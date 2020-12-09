import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette,
  ISessionContext,
  IWidgetTracker,
  WidgetTracker
} from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import {
  INotebookTracker,
  NotebookActions,
  NotebookPanel
} from '@jupyterlab/notebook';

import { Kernel, KernelMessage, Session } from '@jupyterlab/services';

import { Signal } from '@lumino/signaling';

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

  /**
   * Toggle the auto-starting of clients.
   */
  export const toggleAutoStartClient = 'dask:toggle-auto-start-client';
}

const PLUGIN_ID = 'dask-labextension:plugin';

/**
 * The dask dashboard extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  activate,
  id: PLUGIN_ID,
  requires: [
    ICommandPalette,
    IConsoleTracker,
    ILabShell,
    ILayoutRestorer,
    IMainMenu,
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
async function activate(
  app: JupyterFrontEnd,
  commandPalette: ICommandPalette,
  consoleTracker: IConsoleTracker,
  labShell: ILabShell,
  restorer: ILayoutRestorer,
  mainMenu: IMainMenu,
  notebookTracker: INotebookTracker,
  settingRegistry: ISettingRegistry,
  state: IStateDB
): Promise<void> {
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
    if (!(await Private.shouldUseKernel(kernel))) {
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
      void app.commands.execute(CommandIDs.launchPanel, item);
    },
    linkFinder,
    clientCodeInjector,
    clientCodeGetter: Private.getClientCode,
    registry: app.commands,
    launchClusterId: CommandIDs.launchCluster
  });
  sidebar.id = id;
  sidebar.title.iconClass = 'dask-DaskLogo jp-SideBar-tabIcon';
  sidebar.title.caption = 'Dask';

  // An instance tracker which is used for state restoration.
  const tracker = new WidgetTracker<DaskDashboard>({
    namespace: 'dask-dashboard-launcher'
  });

  // Add state restoration for the dashboard items.
  restorer.add(sidebar, id);
  void restorer.restore(tracker, {
    command: CommandIDs.launchPanel,
    args: widget => widget.item || {},
    name: widget => (widget.item && widget.item.route) || ''
  });

  labShell.add(sidebar, 'left', { rank: 200 });

  const updateDashboards = () => {
    const input = sidebar.dashboardLauncher.input;
    const dashboards = sidebar.dashboardLauncher.items;
    // Update the urls of open dashboards.
    tracker.forEach(widget => {
      // Identify the dashboard item associated with the widget
      const dashboard = dashboards.find(d => widget.item?.route === d.route);

      // If the dashboard item doesn't exist in the new listing, close the pane.
      if (!dashboard) {
        widget.dispose();
        return;
      }

      // Possibly update the name of the existing dashboard pane.
      if (`Dask ${dashboard.label}` !== widget.title.label) {
        widget.title.label = `Dask ${dashboard.label}`;
      }

      // If the dashboard server is inactive, mark it as such.
      if (!input.urlInfo.isActive) {
        widget.dashboardUrl = '';
        widget.active = false;
        return;
      }

      widget.dashboardUrl = input.urlInfo.effectiveUrl || input.urlInfo.url;
      widget.active = true;
    });
  };

  sidebar.dashboardLauncher.input.urlInfoChanged.connect(async (_, args) => {
    updateDashboards();
    // Save the current url to the state DB so it can be
    // reloaded on refresh. Save url instead of effectiveUrl to continue
    // showing user intent.
    const active = sidebar.clusterManager.activeCluster;
    return state.save(id, {
      url: args.newValue.url,
      cluster: active ? active.id : ''
    });
  });
  sidebar.clusterManager.activeClusterChanged.connect(async () => {
    const active = sidebar.clusterManager.activeCluster;
    return state.save(id, {
      url: sidebar.dashboardLauncher.input.urlInfo.url,
      cluster: active ? active.id : ''
    });
  });
  updateDashboards();

  // A function to create a new dask client for a session.
  const createClientForSession = async (
    session: Session.ISessionConnection | null
  ) => {
    if (!session) {
      return;
    }
    const cluster = sidebar.clusterManager.activeCluster;
    if (!cluster || !(await Private.shouldUseKernel(session.kernel))) {
      return;
    }
    return Private.createClientForKernel(cluster, session.kernel!);
  };

  type SessionOwner = NotebookPanel | ConsolePanel;
  // An array of the trackers to check for active sessions.
  const trackers: IWidgetTracker<SessionOwner>[] = [
    notebookTracker,
    consoleTracker
  ];

  // A function to recreate a dask client on reconnect.
  const injectOnSessionStatusChanged = async (
    sessionContext: ISessionContext
  ) => {
    if (
      sessionContext.session &&
      sessionContext.session.kernel &&
      sessionContext.session.kernel.status === 'restarting'
    ) {
      return createClientForSession(sessionContext.session);
    }
  };

  // A function to inject a dask client when a new session owner is added.
  const injectOnWidgetAdded = (
    _: IWidgetTracker<SessionOwner>,
    widget: SessionOwner
  ) => {
    widget.sessionContext.statusChanged.connect(injectOnSessionStatusChanged);
  };

  // A function to inject a dask client when the active cluster changes.
  const injectOnClusterChanged = () => {
    trackers.forEach(tracker => {
      tracker.forEach(async widget => {
        const session = widget.sessionContext.session;
        if (session && (await Private.shouldUseKernel(session.kernel))) {
          return createClientForSession(session);
        }
      });
    });
  };

  // Whether the dask cluster clients should aggressively inject themselves
  // into the current session.
  let autoStartClient: boolean = false;

  // Update the existing trackers and signals in light of a change to the
  // settings system. In particular, this reacts to a change in the setting
  // for auto-starting cluster client.
  const updateTrackers = () => {
    // Clear any existing signals related to the auto-starting.
    Signal.clearData(injectOnWidgetAdded);
    Signal.clearData(injectOnSessionStatusChanged);
    Signal.clearData(injectOnClusterChanged);

    if (autoStartClient) {
      // When a new console or notebook is created, inject
      // a new client into it.
      trackers.forEach(tracker => {
        tracker.widgetAdded.connect(injectOnWidgetAdded);
      });

      // When the status of an existing notebook changes, reinject the client.
      trackers.forEach(tracker => {
        tracker.forEach(async widget => {
          await createClientForSession(widget.sessionContext.session);
          widget.sessionContext.statusChanged.connect(
            injectOnSessionStatusChanged
          );
        });
      });

      // When the active cluster changes, reinject the client.
      sidebar.clusterManager.activeClusterChanged.connect(
        injectOnClusterChanged
      );
    }
  };

  // Fetch the initial state of the settings.
  void Promise.all([settingRegistry.load(PLUGIN_ID), state.fetch(id)]).then(
    async res => {
      const settings = res[0];
      if (!settings) {
        console.warn('Unable to retrieve dask-labextension settings');
        return;
      }
      const state = res[1] as { url?: string; cluster?: string } | undefined;
      const url = state ? state.url : '';
      const cluster = state ? state.cluster : '';
      const dashboardUrl =
        sidebar.dashboardLauncher.input.urlInfo.effectiveUrl ||
        sidebar.dashboardLauncher.input.urlInfo.url;
      if (url && !dashboardUrl) {
        // If there is a URL in the statedb, let it have priority.
        sidebar.dashboardLauncher.input.url = url;
      } else {
        // Otherwise set the default from the settings.
        sidebar.dashboardLauncher.input.url = settings.get('defaultURL')
          .composite as string;
      }

      const onSettingsChanged = () => {
        // Determine whether to use the auto-starting client.
        autoStartClient = settings.get('autoStartClient').composite as boolean;
        updateTrackers();
      };
      onSettingsChanged();
      // React to a change in the settings.
      settings.changed.connect(onSettingsChanged);

      // If an active cluster is in the state, reset it.
      if (cluster) {
        await sidebar.clusterManager.refresh();
        sidebar.clusterManager.setActiveCluster(cluster);
      }
    }
  );

  // Add the command for launching a new dashboard item.
  app.commands.addCommand(CommandIDs.launchPanel, {
    label: args => `Launch Dask ${(args['label'] as string) || ''} Dashboard`,
    caption: 'Launch a Dask dashboard',
    execute: args => {
      // Construct the url for the dashboard.
      const urlInfo = sidebar.dashboardLauncher.input.urlInfo;
      const dashboardUrl = urlInfo.effectiveUrl || urlInfo.url;
      const active = urlInfo.isActive;
      const dashboardItem = args as IDashboardItem;

      // If we already have a dashboard open to this url, activate it
      // but don't create a duplicate.
      const w = tracker.find(w => {
        return !!(w && w.item && w.item.route === dashboardItem.route);
      });
      if (w) {
        if (!w.isAttached) {
          labShell.add(w, 'main');
        }
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
      void tracker.add(dashboard); // no need to wait on this
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
    label: args => (args['isPalette'] ? 'Launch New Cluster' : 'NEW'),
    execute: () => sidebar.clusterManager.start(),
    iconClass: args =>
      args['isPalette'] ? '' : 'jp-AddIcon jp-Icon jp-Icon-16',
    isEnabled: () => sidebar.clusterManager.isReady,
    caption: () => {
      if (sidebar.clusterManager.isReady) {
        return 'Start New Dask Cluster';
      }
      return 'Cluster starting...';
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

  // Add a command to toggle the auto-starting client code.
  app.commands.addCommand(CommandIDs.toggleAutoStartClient, {
    label: 'Auto-Start Dask',
    isToggled: () => autoStartClient,
    execute: async () => {
      const value = !autoStartClient;
      const key = 'autoStartClient';
      return settingRegistry
        .set(PLUGIN_ID, key, value)
        .catch((reason: Error) => {
          console.error(
            `Failed to set ${PLUGIN_ID}:${key} - ${reason.message}`
          );
        });
    }
  });

  // Add some commands to the menu and command palette.
  mainMenu.settingsMenu.addGroup([
    { command: CommandIDs.toggleAutoStartClient }
  ]);
  [CommandIDs.launchCluster, CommandIDs.toggleAutoStartClient].forEach(
    command => {
      commandPalette.addItem({
        category: 'Dask',
        command,
        args: { isPalette: true }
      });
    }
  );

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
  export async function shouldUseKernel(
    kernel: Kernel.IKernelConnection | null | undefined
  ): Promise<boolean> {
    if (!kernel) {
      return false;
    }
    const spec = await kernel.spec;
    return !!spec && spec.language.toLowerCase().indexOf('python') !== -1;
  }

  /**
   * Check a kernel for whether it has a default client dashboard address.
   */
  export function checkKernel(
    kernel: Kernel.IKernelConnection
  ): Promise<string> {
    const code = `try:\n  from dask.distributed import default_client as _internal_jlab_default_client\n  display(_internal_jlab_default_client().dashboard_link)\nexcept:\n  pass`;
    const content: KernelMessage.IExecuteRequestMsg['content'] = {
      store_history: false,
      code
    };
    return new Promise<string>((resolve, _) => {
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
  export async function createClientForKernel(
    model: IClusterModel,
    kernel: Kernel.IKernelConnection
  ): Promise<string> {
    const code = `import dask; from dask.distributed import Client
dask.config.set({'scheduler-address': '${model.scheduler_address}'})
client = Client()`;
    const content: KernelMessage.IExecuteRequestMsg['content'] = {
      store_history: false,
      code
    };
    return new Promise<string>((resolve, _) => {
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
    const code = getClientCode(cluster);
    editor.model.value.insert(offset, code);
  }

  /**
   * Get code to connect to a given cluster.
   */
  export function getClientCode(cluster: IClusterModel): string {
    return `from dask.distributed import Client

client = Client("${cluster.scheduler_address}")
client`;
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
      kernel = (current as NotebookPanel).sessionContext.session?.kernel;
    } else if (current && consoleTracker.has(current)) {
      kernel = (current as ConsolePanel).sessionContext.session?.kernel;
    } else if (notebookTracker.currentWidget) {
      const current = notebookTracker.currentWidget;
      kernel = current.sessionContext.session?.kernel;
    } else if (consoleTracker.currentWidget) {
      const current = consoleTracker.currentWidget;
      kernel = current.sessionContext.session?.kernel;
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
