import {StackOffset} from './stack';
import {ScaleType, NiceTime} from './scale';
import {isArray} from './util';

export interface VgData {
  name: string;
  source?: string;
  values?: any;
  format?: any;
  url?: any;
  transform?: any;
}

export type VgParentRef = {
  parent: string
};

export type VgFieldRef = string | VgParentRef | VgParentRef[];

export type VgSortField = boolean | {
  field: VgFieldRef,
  op: string
};

export type VgDataRef = {
  data: string,
  field: VgFieldRef,
  sort?: VgSortField
};

// TODO: add type of value (Make it VgValueRef<T> {value?:T ...})
export type VgValueRef = {
  value?: number | string | boolean,
  field?: string | {
    datum?: string,
    group?: string,
    parent?: string
  },
  signal?: string;
  scale?: string, // TODO: object
  mult?: number,
  offset?: number | VgValueRef,
  band?: boolean | number
};

// TODO: add vg prefix
export type DataRefUnionDomain = {
  fields: (any[] | VgDataRef)[],
  sort?: boolean | {
    op: 'count'
  }
};

// TODO: add vg prefix
export type FieldRefUnionDomain = {
  data: string,
  fields: VgFieldRef[],
  sort?: boolean | {
    op: 'count'
  }
};

export type VgRangeScheme = {scheme: string, extent?: number[], count?: number};
export type VgRange = string | VgDataRef | (number|string|VgDataRef)[] | VgRangeScheme | {step: number};

export type VgDomain = any[] | VgDataRef | DataRefUnionDomain | FieldRefUnionDomain;

export type VgScale = {
  name: string,
  type: ScaleType,
  domain: VgDomain,
  range: VgRange,

  clamp?: boolean,
  exponent?: number,
  nice?: boolean | NiceTime,
  padding?: number,
  paddingInner?: number,
  paddingOuter?: number,
  reverse?: boolean,
  round?: boolean,
  zero?: boolean
};

export function isDataRefUnionedDomain(domain: VgDomain): domain is DataRefUnionDomain {
  if (!isArray(domain)) {
    return 'fields' in domain && !('data' in domain);
  }
  return false;
}

export function isFieldRefUnionDomain(domain: VgDomain): domain is FieldRefUnionDomain {
  if (!isArray(domain)) {
    return 'fields' in domain && 'data' in domain;
  }
  return false;
}

export function isDataRefDomain(domain: VgDomain): domain is VgDataRef {
  if (!isArray(domain)) {
    return !('fields' in domain);
  }
  return false;
}

export type VgEncodeEntry = any;
// TODO: make export interface VgEncodeEntry {
//   x?: VgValueRef<number>
//   y?: VgValueRef<number>
//  ...
//   color?: VgValueRef<string>
//  ...
// }

export type VgAxis = any;
export type VgLegend = any;

export interface VgBinTransform {
  type: 'bin';
  field: string;
  as: string;
  extent?: {signal: string};
  // TODO: add other properties
}

export interface VgExtentTransform {
  type: 'extent';
  field: string;
  signal: string;
}

export interface VgFormulaTransform {
  type: 'formula';
  as: string;
  expr: string;
}

export interface VgAxisEncode {
  ticks?: VgGuideEncode;
  labels?: VgGuideEncode;
  title?: VgGuideEncode;
  grid?: VgGuideEncode;
  domain?: VgGuideEncode;
}

export interface VgLegendEncode {
  title?: VgGuideEncode;
  labels?: VgGuideEncode;
  legend?: VgGuideEncode;
  symbols?: VgGuideEncode;
  gradient?: VgGuideEncode;
}

export type VgGuideEncode = any; // TODO: replace this (See guideEncode in Vega Schema)

export type VgTransform = VgBinTransform | VgExtentTransform | VgFormulaTransform | any;

export interface VgStackTransform {
  type: 'stack';
  offset?: StackOffset;
  groupby: string[];
  field: string;
  sort: VgSort;
  as: string[];
}

export type VgSort = {
  field: string;
  order: 'ascending' | 'descending';
} | {
  field: string[];
  order: ('ascending' | 'descending')[];
};

export interface VgImputeTransform {
  type: 'impute';
  groupby?: string[];
  field: string;
  orderby?: string[];
  method?: 'value' | 'median' | 'max' | 'min' | 'mean';
  value?: any;
}

export interface VgAxisBase {
  /**
   * Whether to include the axis domain line.
   */
  domain?: boolean;

  /**
   * A flag indicate if gridlines should be created in addition to ticks. If `grid` is unspecified, the default value is `true` for ROW and COL. For X and Y, the default value is `true` for quantitative and time fields and `false` otherwise.
   */
  grid?: boolean;

  /**
   * Enable or disable labels.
   */
  labels?: boolean;

  /**
   * The rotation angle of the axis labels.
   * @minimum 0
   * @maximum 360
   */
  labelAngle?: number;  // FIXME: not sure if this should be a theme

  /**
   * Whether the axis should include ticks.
   */
  ticks?: boolean;

  /**
   * The size, in pixels, of major, minor and end ticks.
   * @minimum 0
   */
  tickSize?: number;

  /**
   * Max length for axis title if the title is automatically generated from the field's description. By default, this is automatically based on cell size and characterWidth property.
   * @minimum 0
   * @TJS-type integer
   */
  titleMaxLength?: number;

  /**
   * The padding, in pixels, between title and axis.
   */
  titlePadding?: number;

  /**
   * Minimum extent, which determines the offset between axis ticks and labels.
   */
  minExtent?: number;

  /**
   * Maximum extent, which determines the offset between axis ticks and labels.
   */
  maxExtent?: number;

  /**
   * Whether month and day names should be abbreviated.
   */
  shortTimeLabels?: boolean;
}
