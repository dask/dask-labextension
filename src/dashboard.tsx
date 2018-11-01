import { CommandRegistry } from '@phosphor/commands';

import { JSONObject } from '@phosphor/coreutils';

import * as React from 'react';

/**
 * A React component for a launcher button listing.
 */
export class DashboardListing extends React.Component<
  IDashboardListingProps,
  {}
> {
  /**
   * Render the listing.
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
            disabled={!this.props.isEnabled}
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
 * Props for the dashboard listing component.
 */
export interface IDashboardListingProps extends React.Props<DashboardListing> {
  /**
   * A command registry.
   */
  commands: CommandRegistry;

  /**
   * A list of dashboard items to render.
   */
  items: IDashboardItem[];

  /**
   * Whether the items should be enabled.
   */
  isEnabled: boolean;
}

/**
 * An interface dashboard launcher item.
 */
export interface IDashboardItem extends JSONObject {
  /**
   * The route to add the the base url.
   */
  route: string;

  /**
   * The display label for the item.
   */
  label: string;
}
