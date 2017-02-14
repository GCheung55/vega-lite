import {DateTime} from './datetime';
import {VgAxisEncode, VgAxisBase} from './vega.schema';

export type AxisOrient = 'top' | 'right' | 'left' | 'bottom';

export interface AxisConfig extends AxisBase {
  // ---------- Axis ----------
  /**
   * Width of the axis line
   */
  domainWidth?: number;

  /**
   * Color of axis line.
   */
  domainColor?: string;

  // ---------- Grid ----------
  /**
   * Color of gridlines.
   */
  gridColor?: string;

  /**
   * The offset (in pixels) into which to begin drawing with the grid dash array.
   * @minimum 0
   */
  gridDash?: number[];

  /**
   * The stroke opacity of grid (value between [0,1])
   * @minimum 0
   * @maximum 1
   */
  gridOpacity?: number;

  /**
   * The grid width, in pixels.
   * @minimum 0
   */
  gridWidth?: number;

  // ---------- Ticks ----------
  /**
   * The color of the axis's tick.
   */
  tickColor?: string;

  /**
   * The color of the tick label, can be in hex color code or regular color name.
   */
  labelColor?: string;

  /**
   * The font of the tick label.
   */
  labelFont?: string;

  /**
   * The font size of label, in pixels.
   * @minimum 0
   */
  labelFontSize?: number;

  /**
   * The width, in pixels, of ticks.
   * @minimum 0
   */
  tickWidth?: number;

  // ---------- Title ----------
  /**
   * Color of the title, can be in hex color code or regular color name.
   */
  titleColor?: string;

  /**
   * Font of the title.
   */
  titleFont?: string;

  /**
   * Size of the title.
   * @minimum 0
   */
  titleFontSize?: number;

  /**
   * Weight of the title.
   */
  titleFontWeight?: string | number;

  /**
   * A title offset value for the axis.
   */
  titleOffset?: number;   // FIXME: not sure if we need have this in vg3 or not
}

// TODO: add comment for properties that we rely on Vega's default to produce
// more concise Vega output.

export const defaultAxisConfig: AxisConfig = {
  labelMaxLength: 25,
};

export const defaultFacetAxisConfig: AxisConfig = {
  domainWidth: 0,
};

export interface Axis extends AxisBase {
  /**
   * The padding, in pixels, between axis and text labels.
   */
  labelPadding?: number;

  /**
   * The formatting pattern for axis labels.
   */
  format?: string; // default value determined by config.format anyway

  /**
   * The orientation of the axis. One of top, bottom, left or right. The orientation can be used to further specialize the axis type (e.g., a y axis oriented for the right edge of the chart).
   */
  orient?: AxisOrient;

  /**
   * The offset, in pixels, by which to displace the axis from the edge of the enclosing group or data rectangle.
   */
  offset?: number;

  // FIXME: Add Description
  position?: number;

  /**
   * A desired number of ticks, for axes visualizing quantitative scales. The resulting number may be different so that values are "nice" (multiples of 2, 5, 10) and lie within the underlying scale's range.
   * @minimum 0
   * @TJS-type integer
   */
  tickCount?: number;

  /**
   * A title for the axis. Shows field name and its function by default.
   */
  title?: string;

  values?: number[] | DateTime[];

  /**
   * A non-positive integer indicating z-index of the axis.
   * If zindex is 0, axes should be drawn behind all chart elements.
   * To put them in front, use zindex = 1.
   * @TJS-type integer
   * @minimum 0
   */
  zindex?: number;

  /**
   * Optional mark definitions for custom axis encoding.
   */
  encode?: VgAxisEncode;
}

export interface AxisBase extends VgAxisBase, VlAxisBase {}

export interface VlAxisBase {
  /**
   * Truncate labels that are too long.
   * @minimum 1
   * @TJS-type integer
   */
  labelMaxLength?: number;
}

export const AXIS_PROPERTIES:(keyof Axis)[] = [
  // a) properties with special rules (so it has axis[property] methods) -- call rule functions
  'domain', 'format', 'labels', 'grid', 'orient', 'ticks', 'tickSize', 'tickCount',  'title', 'values', 'zindex',
  // b) properties without rules, only produce default values in the schema, or explicit value if specified
    'labelPadding', 'maxExtent', 'minExtent', 'offset', 'position', 'tickSize', 'titlePadding'
];

export const AXIS_BASE_PROPERTIES:(keyof VlAxisBase)[] = ['labelMaxLength'];
