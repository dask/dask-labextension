import { CommandRegistry } from '@phosphor/commands';

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
    this._commands = options.commands;
  }

  /**
   * Handle an update request.
   */
  protected onUpdateRequest(msg: Message): void {
    // Don't bother if the TOC is not visible
    if (!this.isVisible) {
      return;
    }

    ReactDOM.render(<DashboardListing commands={this._commands} />, this.node);
  }

  /**
   * Rerender after showing.
   */
  protected onAfterShow(msg: Message): void {
    this.update();
  }

  private _commands: CommandRegistry;
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
    const types = ['tasks', 'workers'];
    let listing: JSX.Element[] = types.map(t => {
      const handler = () => {
        this.props.commands.execute('dask:launch-dashboard', { type: t });
      };
      return <button value={t} onClick={handler} />;
    });

    // Return the JSX component.
    return (
      <div>
        <ul>{listing}</ul>
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
}
/**
 * A namespace for DaskDashboardLauncher statics.
 */
export namespace DaskDashboardLauncher {
  /**
   * Options for the constructor.
   */
  export interface IOptions {
    /**
     * The document manager for the application.
     */
    commands: CommandRegistry;
  }
}
