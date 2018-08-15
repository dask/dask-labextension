import { CommandRegistry } from '@phosphor/commands';

import { JSONObject } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { Widget } from '@phosphor/widgets';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

/**
 * A widget for hosting a notebook table-of-contents.
 */
export class DaskDashboardLauncher extends Widget {
  /**
   * Create a new table of contents.
   */
  constructor(options: DaskDashboardLauncher.IOptions) {
    super();
    this.addClass('dask-DaskDashboardLauncher');
    this._commands = options.commands;
    this._items = options.items || DaskDashboardLauncher.DEFAULT_ITEMS;
  }

  get items(): DaskDashboardLauncher.IItem[] {
    return this._items;
  }

  /**
   * Handle an update request.
   */
  protected onUpdateRequest(msg: Message): void {
    // Don't bother if the TOC is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(
      <DashboardListing commands={this._commands} items={this._items} />,
      this.node
    );
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  private _commands: CommandRegistry;
  private _items: DaskDashboardLauncher.IItem[];
}

/**
 * A React component for a launcher button listing.
 */
export class DashboardListing extends React.Component<
  IDashboardListingProps,
  {}
> {
  /**
   * Render the TOCTree.
   */
  render() {
    let listing = this.props.items.map(item => {
      const handler = () => {
        this.props.commands.execute('dask:launch-dashboard', item);
      };
      return (
        <li className="dask-DashboardListing-item" key={item.route}>
          <button
            className="jp-mod-styled jp-mod-accept"
            value={item.label}
            onClick={handler}
          >
            {item.label}
          </button>
        </li>
      );
    });

    // Return the JSX component.
    return (
      <div>
        <ul className="dask-DashboardListing-list">{listing}</ul>
      </div>
    );
  }
}
/**
 * Props for the TOCTree component.
 */
export interface IDashboardListingProps extends React.Props<DashboardListing> {
  /**
   * A command registry.
   */
  commands: CommandRegistry;

  items: DaskDashboardLauncher.IItem[];
}
/**
 * A namespace for DaskDashboardLauncher statics.
 */
export namespace DaskDashboardLauncher {
  /**
   * An interface dashboard launcher item.
   */
  export interface IItem extends JSONObject {
    /**
     * The route to add the the base url.
     */
    route: string;

    /**
     * The display label for the item.
     */
    label: string;
  }

  /**
   * Options for the constructor.
   */
  export interface IOptions {
    /**
     * The document manager for the application.
     */
    commands: CommandRegistry;

    /**
     * A list of items for the launcher.
     */
    items?: IItem[];
  }

  export const DEFAULT_ITEMS = [
    { route: 'solo-graph', label: 'Graph' },
    { route: 'solo-load', label: 'Load' },
    { route: 'solo-profile', label: 'Profile' },
    { route: 'solo-progress', label: 'Progress' },
    { route: 'solo-task-stream', label: 'Task Stream' }
  ];
}
